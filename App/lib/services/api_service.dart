import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'https://jed-uv1d.onrender.com';
  static const Duration timeout = Duration(seconds: 60);

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('jed_token');
  }

  static Future<void> saveSession(String token, String spaceId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('jed_token', token);
    await prefs.setString('jed_space', spaceId);
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('jed_token');
    await prefs.remove('jed_space');
  }

  static Future<String?> getSpaceId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('jed_space');
  }

  static Future<Map<String, dynamic>> createSpace(String spaceId, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/spaces/create'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'space_id': spaceId, 'password': password}),
    ).timeout(timeout);

    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> login(String spaceId, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/spaces/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'space_id': spaceId, 'password': password}),
    ).timeout(timeout);

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      await saveSession(data['token'], data['space_id']);
      return {'success': true, ...data};
    }
    return {'success': false, 'error': jsonDecode(response.body)['detail'] ?? 'Login failed'};
  }

  static Future<void> logout() async {
    final token = await getToken();
    if (token != null) {
      try {
        await http.post(Uri.parse('$baseUrl/spaces/logout?token=$token')).timeout(timeout);
      } catch (_) {}
    }
    await clearSession();
  }

  static Future<List<Map<String, dynamic>>> getFiles() async {
    final token = await getToken();
    final response = await http.get(
      Uri.parse('$baseUrl/files?token=$token'),
    ).timeout(timeout);

    if (response.statusCode == 200) {
      return List<Map<String, dynamic>>.from(jsonDecode(response.body));
    }
    return [];
  }

  static Future<bool> uploadFile(File file) async {
    final token = await getToken();
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/files/upload'));
    request.fields['token'] = token!;
    request.files.add(await http.MultipartFile.fromPath('file', file.path));

    final response = await request.send().timeout(timeout);
    return response.statusCode == 200;
  }

  static Future<bool> deleteFile(int fileId) async {
    final token = await getToken();
    final response = await http.delete(
      Uri.parse('$baseUrl/files/$fileId?token=$token'),
    ).timeout(timeout);
    return response.statusCode == 200;
  }

  static String getDownloadUrl(int fileId, String token) {
    return '$baseUrl/files/download/$fileId?token=$token';
  }

  static String getPreviewUrl(int fileId, String token) {
    return '$baseUrl/files/preview/$fileId?token=$token';
  }
}
