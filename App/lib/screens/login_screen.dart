import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'drive_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLogin = true;
  bool _isLoading = false;
  String _message = '';
  bool _isError = false;

  final _spaceIdController = TextEditingController();
  final _passwordController = TextEditingController();

  void _showMessage(String msg, bool isError) {
    setState(() {
      _message = msg;
      _isError = isError;
    });
  }

  Future<void> _handleSubmit() async {
    if (_spaceIdController.text.isEmpty || _passwordController.text.isEmpty) {
      _showMessage('Please fill all fields', true);
      return;
    }

    setState(() => _isLoading = true);
    _showMessage('Connecting to server...', false);

    try {
      if (_isLogin) {
        final result = await ApiService.login(
          _spaceIdController.text,
          _passwordController.text,
        );
        if (result['success']) {
          if (mounted) {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (_) => const DriveScreen()),
            );
          }
        } else {
          _showMessage(result['error'], true);
        }
      } else {
        final result = await ApiService.createSpace(
          _spaceIdController.text,
          _passwordController.text,
        );
        if (result['message'] != null) {
          _showMessage('Space created! You can now login.', false);
          setState(() => _isLogin = true);
        } else {
          _showMessage(result['detail'] ?? 'Creation failed', true);
        }
      }
    } catch (e) {
      _showMessage('Connection error. Server may be waking up, try again.', true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 60),
              const Text('📁', style: TextStyle(fontSize: 64)),
              const SizedBox(height: 16),
              const Text('JED', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
              const Text('Just Enough Drives', style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 48),
              
              // Tabs
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _isLogin = true),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: _isLogin ? const Color(0xFF4f46e5) : Colors.transparent,
                          border: Border.all(color: _isLogin ? const Color(0xFF4f46e5) : const Color(0xFF333333)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Enter Space',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: _isLogin ? Colors.white : Colors.grey),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _isLogin = false),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: !_isLogin ? const Color(0xFF4f46e5) : Colors.transparent,
                          border: Border.all(color: !_isLogin ? const Color(0xFF4f46e5) : const Color(0xFF333333)),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Create Space',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: !_isLogin ? Colors.white : Colors.grey),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              TextField(
                controller: _spaceIdController,
                decoration: const InputDecoration(labelText: 'Space ID'),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _handleSubmit,
                  child: _isLoading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(_isLogin ? 'Enter' : 'Create Space'),
                ),
              ),

              if (_message.isNotEmpty) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _isError ? const Color(0xFF7f1d1d) : const Color(0xFF14532d),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_message, style: TextStyle(color: _isError ? const Color(0xFFfca5a5) : const Color(0xFF86efac))),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
