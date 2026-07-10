import 'dart:async';
import 'package:flutter/material.dart';

import '../models/chat_models.dart';
import '../services/meshtastic_service.dart';

/// Pestaña Correo: redacta y envía un correo por el gateway (SMTP). El
/// destinatario se elige de la libreta (dropdown de nombres) o se escribe un
/// email libre. El gateway resuelve el alias y envía; responde MAIL|ok/err.
class EmailScreen extends StatefulWidget {
  final MeshtasticService meshtasticService;

  const EmailScreen({super.key, required this.meshtasticService});

  @override
  State<EmailScreen> createState() => _EmailScreenState();
}

/// Valor especial del dropdown para "escribir un correo que no está en la lista".
const String _kCustom = '__custom__';

class _EmailScreenState extends State<EmailScreen> {
  MeshtasticService get _service => widget.meshtasticService;
  StreamSubscription<ChatMessage>? _sub;

  String? _selected; // alias elegido, o _kCustom
  final _customCtrl = TextEditingController();
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();

  bool _sending = false;
  DateTime? _pendingSince;
  DateTime? _shownResultAt;
  Timer? _sendTimeout;

  @override
  void initState() {
    super.initState();
    _service.addListener(_onChange);
    _sub = _service.messageStream.listen((_) => _onChange());
    _refreshContacts();
  }

  @override
  void dispose() {
    _service.removeListener(_onChange);
    _sub?.cancel();
    _sendTimeout?.cancel();
    _customCtrl.dispose();
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }

  void _onChange() {
    if (!mounted) return;
    // Procesa los mensajes nuevos del gateway ANTES de leer el resultado
    // (parseGatewayEntries puebla lastEmailAt/lastEmailResult al ver MAIL|).
    _service.parseGatewayEntries();
    // ¿Llegó una respuesta MAIL| nueva después de que enviamos?
    final at = _service.lastEmailAt;
    if (at != null &&
        at != _shownResultAt &&
        (_pendingSince == null || at.isAfter(_pendingSince!))) {
      _shownResultAt = at;
      _sending = false;
      _sendTimeout?.cancel();
      final ok = _service.lastEmailOk;
      final msg = _service.lastEmailResult ?? (ok ? 'Correo enviado.' : 'Error.');
      if (ok) {
        _subjectCtrl.clear();
        _bodyCtrl.clear();
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: ok ? Colors.green.shade700 : Colors.red.shade700,
      ));
    }
    setState(() {});
  }

  void _refreshContacts() {
    if (_service.isConnected) _service.requestEmailContacts();
  }

  String get _destino =>
      _selected == _kCustom ? _customCtrl.text.trim() : (_selected ?? '');

  /// Bytes que ocupará el mensaje en la mesh: "@mail|dest|asunto|cuerpo".
  int get _wireBytes => MeshtasticService.getUtf8ByteLength(
      '@mail|$_destino|${_subjectCtrl.text}|${_bodyCtrl.text}');

  bool get _canSend =>
      _service.isConnected &&
      !_sending &&
      _destino.isNotEmpty &&
      _bodyCtrl.text.trim().isNotEmpty &&
      _wireBytes <= MeshtasticService.maxMessageBytes;

  Future<void> _send() async {
    if (!_canSend) return;
    setState(() {
      _sending = true;
      _pendingSince = DateTime.now();
    });
    final ok = await _service.sendEmail(
        _destino, _subjectCtrl.text.trim(), _bodyCtrl.text.trim());
    if (!ok && mounted) {
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('No se pudo enviar a la mesh. ¿Conectado?'),
        backgroundColor: Colors.red,
      ));
      return;
    }
    // Si ok, esperamos la respuesta MAIL| del gateway (la maneja _onChange).
    // Red de seguridad: si no llega en 60 s, dejamos de esperar.
    _sendTimeout?.cancel();
    _sendTimeout = Timer(const Duration(seconds: 60), () {
      if (mounted && _sending) {
        setState(() => _sending = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Sin confirmación del gateway. El correo pudo enviarse igual.'),
          backgroundColor: Colors.orange,
        ));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final contacts = _service.emailContactList();
    final remaining = MeshtasticService.maxMessageBytes - _wireBytes;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.email),
            SizedBox(width: 8),
            Text('Correo'),
          ],
        ),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Actualizar libreta',
            onPressed: _service.isConnected ? _refreshContacts : null,
          ),
        ],
        bottom: _service.isConnected
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(24),
                child: Container(
                  width: double.infinity,
                  color: Colors.orange.shade100,
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text(
                    _service.statusMessage,
                    textAlign: TextAlign.center,
                    style:
                        TextStyle(fontSize: 12, color: Colors.orange.shade900),
                  ),
                ),
              ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Para', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            initialValue: _selected,
            isExpanded: true,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.person_outline),
              hintText: 'Elige un destinatario',
            ),
            items: [
              ...contacts.map((c) => DropdownMenuItem(
                    value: c.key,
                    child: Text('${c.value}  ·  ${c.key}',
                        overflow: TextOverflow.ellipsis),
                  )),
              const DropdownMenuItem(
                value: _kCustom,
                child: Row(children: [
                  Icon(Icons.edit, size: 18),
                  SizedBox(width: 8),
                  Text('Otro correo…'),
                ]),
              ),
            ],
            onChanged: (v) => setState(() => _selected = v),
          ),
          if (_selected == _kCustom) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _customCtrl,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.alternate_email),
                labelText: 'Correo destino',
                hintText: 'persona@ejemplo.com',
              ),
            ),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _subjectCtrl,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.subject),
              labelText: 'Asunto (opcional)',
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _bodyCtrl,
            minLines: 4,
            maxLines: 10,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              labelText: 'Mensaje',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            remaining >= 0
                ? 'Espacio restante: $remaining bytes'
                : 'Mensaje muy largo: ${-remaining} bytes de más',
            style: TextStyle(
              fontSize: 12,
              color: remaining >= 0 ? Colors.grey.shade600 : Colors.red,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _canSend ? _send : null,
            icon: _sending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send),
            label: Text(_sending ? 'Enviando…' : 'Enviar correo'),
          ),
          const SizedBox(height: 12),
          Text(
            'El correo lo envía el gateway por SMTP. Elige un nombre de la '
            'libreta o escribe un correo. La libreta la gestiona el '
            'administrador en el panel web.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }
}
