import 'package:flutter/material.dart';

import '../models/chat_models.dart';
import '../services/meshtastic_service.dart';

/// Ajustes: estado de conexión, nodo BLE, nodo del gateway y reset.
class SettingsScreen extends StatefulWidget {
  final MeshtasticService meshtasticService;
  final VoidCallback onDeviceChange;

  const SettingsScreen({
    super.key,
    required this.meshtasticService,
    required this.onDeviceChange,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  MeshtasticService get _service => widget.meshtasticService;

  @override
  void initState() {
    super.initState();
    _service.addListener(_onChange);
  }

  @override
  void dispose() {
    _service.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  Color _statusColor() => switch (_service.status) {
        ConnectionStatus.connected => Colors.green,
        ConnectionStatus.connecting || ConnectionStatus.scanning => Colors.orange,
        ConnectionStatus.disconnected || ConnectionStatus.error => Colors.red,
      };

  Future<void> _editGatewayNode() async {
    final controller = TextEditingController(
      text: '!${_service.currentGatewayNodeId.toRadixString(16)}',
    );
    final result = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nodo del gateway'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'ID del nodo Meshtastic del gateway (formato !hex, ej. !9ea1ff28). '
              'A este nodo se envían las consultas @claude.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: 'Node ID',
                hintText: '!9ea1ff28',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () {
              final raw = controller.text.trim().replaceFirst('!', '');
              final parsed = int.tryParse(raw, radix: 16);
              Navigator.pop(context, parsed);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (result != null) {
      await _service.saveGatewayNodeId(result);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gateway: !${result.toRadixString(16)}')),
        );
      }
    }
  }

  Future<void> _confirmForget() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('¿Olvidar dispositivo?'),
        content: const Text(
          'La app olvidará el nodo BLE guardado y volverás a la pantalla de '
          'selección de dispositivo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Olvidar'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await _service.disconnectAndClear();
      widget.onDeviceChange();
    }
  }

  @override
  Widget build(BuildContext context) {
    final gwNode = _service.currentGatewayNode;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ajustes'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: ListView(
        children: [
          const _SectionHeader('Conexión'),
          ListTile(
            leading: Icon(Icons.circle, size: 14, color: _statusColor()),
            title: const Text('Estado'),
            subtitle: Text(_service.statusMessage),
          ),
          ListTile(
            leading: const Icon(Icons.bluetooth),
            title: const Text('Nodo BLE conectado'),
            subtitle: Text(
              _service.connectedDeviceName ??
                  _service.connectedDeviceMac ??
                  'Ninguno',
            ),
          ),
          if (_service.myNodeNum != null)
            ListTile(
              leading: const Icon(Icons.tag),
              title: const Text('Mi Node ID'),
              subtitle: Text('!${_service.myNodeNum!.toRadixString(16)}'),
            ),
          const Divider(),
          const _SectionHeader('Claude / Gateway'),
          ListTile(
            leading: const Icon(Icons.router),
            title: const Text('Nodo del gateway'),
            subtitle: Text(
              gwNode?.displayName ??
                  '!${_service.currentGatewayNodeId.toRadixString(16)}',
            ),
            trailing: const Icon(Icons.edit),
            onTap: _editGatewayNode,
          ),
          const Divider(),
          const _SectionHeader('Dispositivo'),
          ListTile(
            leading: const Icon(Icons.swap_horiz),
            title: const Text('Cambiar / olvidar nodo BLE'),
            subtitle: const Text('Vuelve a la selección de dispositivo'),
            onTap: _confirmForget,
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'Mesh Chat · v4.0.0',
              style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.primary,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
