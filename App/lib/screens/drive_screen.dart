import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import 'login_screen.dart';
import 'preview_screen.dart';

class DriveScreen extends StatefulWidget {
  const DriveScreen({super.key});

  @override
  State<DriveScreen> createState() => _DriveScreenState();
}

class _DriveScreenState extends State<DriveScreen> {
  List<Map<String, dynamic>> _files = [];
  bool _isLoading = true;
  String? _spaceId;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    _spaceId = await ApiService.getSpaceId();
    await _loadFiles();
  }

  Future<void> _loadFiles() async {
    setState(() => _isLoading = true);
    try {
      final files = await ApiService.getFiles();
      setState(() {
        _files = files;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error loading files')),
        );
      }
    }
  }

  Future<void> _uploadFile() async {
    final result = await FilePicker.platform.pickFiles();
    if (result == null) return;

    final file = File(result.files.single.path!);
    
    setState(() => _isLoading = true);
    final success = await ApiService.uploadFile(file);
    
    if (success) {
      await _loadFiles();
    } else {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Upload failed')),
        );
      }
    }
  }

  String? _getPreviewType(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    const previewable = {
      'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
      'video': ['mp4', 'webm', 'ogg', 'mov'],
      'audio': ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
    };
    
    for (final entry in previewable.entries) {
      if (entry.value.contains(ext)) return entry.key;
    }
    return null;
  }

  Future<void> _openFile(int fileId, String filename) async {
    final type = _getPreviewType(filename);
    
    if (type == 'image') {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => PreviewScreen(fileId: fileId, filename: filename, type: type!),
        ),
      );
    } else if (type != null) {
      // Video/audio - open in browser
      final token = await ApiService.getToken();
      final url = ApiService.getPreviewUrl(fileId, token!);
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } else {
      // Download non-previewable files
      await _downloadFile(fileId, filename);
    }
  }

  Future<void> _downloadFile(int fileId, String filename) async {
    final token = await ApiService.getToken();
    final url = ApiService.getDownloadUrl(fileId, token!);
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  Future<void> _deleteFile(int fileId) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete file?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );

    if (confirm != true) return;

    final success = await ApiService.deleteFile(fileId);
    if (success) {
      await _loadFiles();
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Delete failed')),
        );
      }
    }
  }

  Future<void> _logout() async {
    await ApiService.logout();
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }

  String _getFileIcon(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    const icons = {
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp3': '🎵', 'wav': '🎵', 'mp4': '🎬', 'mkv': '🎬',
      'zip': '📦', 'rar': '📦', 'js': '💻', 'py': '💻',
    };
    return icons[ext] ?? '📁';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('📁 ${_spaceId ?? "Loading..."}'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadFiles),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _files.isEmpty
              ? const Center(child: Text('No files yet. Upload something!', style: TextStyle(color: Colors.grey)))
              : RefreshIndicator(
                  onRefresh: _loadFiles,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _files.length,
                    itemBuilder: (ctx, i) {
                      final file = _files[i];
                      return Card(
                        color: const Color(0xFF0f0f1a),
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          onTap: () => _openFile(file['id'], file['filename']),
                          leading: Text(_getFileIcon(file['filename']), style: const TextStyle(fontSize: 28)),
                          title: Text(file['filename'], overflow: TextOverflow.ellipsis),
                          subtitle: Text(_formatSize(file['size']), style: const TextStyle(color: Colors.grey)),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.download),
                                onPressed: () => _downloadFile(file['id'], file['filename']),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete),
                                onPressed: () => _deleteFile(file['id']),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _uploadFile,
        icon: const Icon(Icons.upload),
        label: const Text('Upload'),
        backgroundColor: const Color(0xFF4f46e5),
      ),
    );
  }
}
