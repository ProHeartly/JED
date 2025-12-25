import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';

class PreviewScreen extends StatefulWidget {
  final int fileId;
  final String filename;
  final String type;

  const PreviewScreen({
    super.key,
    required this.fileId,
    required this.filename,
    required this.type,
  });

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  String? _previewUrl;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  Future<void> _loadPreview() async {
    final token = await ApiService.getToken();
    setState(() {
      _previewUrl = ApiService.getPreviewUrl(widget.fileId, token!);
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(widget.filename, overflow: TextOverflow.ellipsis),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _buildPreview(),
    );
  }

  Widget _buildPreview() {
    if (_previewUrl == null) {
      return const Center(child: Text('Unable to load preview'));
    }

    switch (widget.type) {
      case 'image':
        return InteractiveViewer(
          child: Center(
            child: Image.network(
              _previewUrl!,
              fit: BoxFit.contain,
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return Center(
                  child: CircularProgressIndicator(
                    value: progress.expectedTotalBytes != null
                        ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes!
                        : null,
                  ),
                );
              },
              errorBuilder: (context, error, stack) {
                return const Center(child: Text('Failed to load image', style: TextStyle(color: Colors.white)));
              },
            ),
          ),
        );
      case 'video':
      case 'audio':
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                widget.type == 'video' ? Icons.video_file : Icons.audio_file,
                size: 64,
                color: Colors.grey,
              ),
              const SizedBox(height: 16),
              Text(widget.filename, style: const TextStyle(color: Colors.white)),
              const SizedBox(height: 8),
              const Text(
                'Tap to open in browser',
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () async {
                  await launchUrl(Uri.parse(_previewUrl!), mode: LaunchMode.externalApplication);
                },
                icon: const Icon(Icons.open_in_browser),
                label: const Text('Open'),
              ),
            ],
          ),
        );
      default:
        return const Center(child: Text('Preview not available', style: TextStyle(color: Colors.white)));
    }
  }
}
