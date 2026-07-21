import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/campo_models.dart';
import '../services/meshtastic_service.dart';

/// Captura de datos en campo.
///
/// Formularios guiados: el operario elige de listas, nunca teclea códigos. El
/// catálogo lo trae la mesh (no internet) y la captura se encola si no hay
/// cobertura, así que en el peor caso el dato sale más tarde — nunca se pierde.
class CampoScreen extends StatefulWidget {
  const CampoScreen({super.key, required this.meshtasticService});

  final MeshtasticService meshtasticService;

  @override
  State<CampoScreen> createState() => _CampoScreenState();
}

class _CampoScreenState extends State<CampoScreen> {
  MeshtasticService get _s => widget.meshtasticService;

  CampoTipo _tipo = CampoTipo.frj;
  String? _lote;
  String? _parcela;
  String? _plaga;
  int _severidad = 3;
  final _valorCtrl = TextEditingController();
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _s.addListener(_onChange);
    if (_s.campoCatalogo == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _pedirCatalogo());
    }
  }

  @override
  void dispose() {
    _s.removeListener(_onChange);
    _valorCtrl.dispose();
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  Future<void> _pedirCatalogo() async {
    if (!_s.isConnected) return;
    await _s.requestCampoCatalog();
  }

  CampoLote? get _loteSel {
    final cat = _s.campoCatalogo;
    if (cat == null || _lote == null) return null;
    for (final l in cat.lotes) {
      if (l.codigo == _lote) return l;
    }
    return null;
  }

  String? _validar() {
    final cat = _s.campoCatalogo;
    if (cat == null || cat.vacio) return 'Todavía no tienes el catálogo.';
    if (_lote == null) return 'Elige el lote.';
    if (_parcela == null) return 'Elige la parcela.';
    if (_tipo == CampoTipo.plg) {
      if (_plaga == null) return 'Elige la plaga.';
      return null; // la severidad siempre tiene valor
    }
    final txt = _valorCtrl.text.trim().replaceAll(',', '.');
    if (txt.isEmpty) return 'Escribe el valor.';
    final v = double.tryParse(txt);
    if (v == null) return 'El valor no es un número.';
    if (v < 0) return 'El valor no puede ser negativo.';
    if (_tipo == CampoTipo.cen && (_loteSel?.cultivo ?? '').isEmpty) {
      return 'Ese lote no tiene cultivo asignado.';
    }
    return null;
  }

  String _construirTrama() {
    final base = '@ag|${_tipo.codigo}|$_lote|$_parcela';
    final valor = _valorCtrl.text.trim().replaceAll(',', '.');
    switch (_tipo) {
      case CampoTipo.plg:
        return '$base|$_plaga|$_severidad';
      case CampoTipo.cen:
        return '$base|${_loteSel!.cultivo}|$valor';
      default:
        return '$base|$valor';
    }
  }

  Future<void> _enviar() async {
    final error = _validar();
    if (error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _enviando = true);
    await _s.capturarCampo(_construirTrama());
    if (!mounted) return;
    setState(() {
      _enviando = false;
      _valorCtrl.clear();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(_s.isConnected
            ? 'Captura enviada'
            : 'Sin malla: guardada, saldrá al reconectar'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  /// Panel de la cámara: elige cuántas reses faltan y manda el conteo.
  Future<void> _abrirSimuladorCamara() async {
    final lote = _loteSel;
    if (lote == null || _parcela == null) return;
    final hato = lote.hatoEsperado ?? 100;
    final faltanCtrl = TextEditingController(text: '0');

    final enviar = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.videocam),
                const SizedBox(width: 8),
                Text('Cámara en ${lote.codigo}',
                    style: Theme.of(ctx).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'La cámara cuenta en el potrero y manda por la mesh solo el '
              'número, nunca el video. Por eso funciona sin señal.',
              style: Theme.of(ctx).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Text('Cabezas esperadas: $hato',
                style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            TextField(
              controller: faltanCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: '¿Cuántas faltan?',
                helperText: '0 = el hato está completo',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => Navigator.pop(ctx, true),
              icon: const Icon(Icons.send),
              label: const Text('Enviar conteo'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (enviar != true || !mounted) return;

    final faltan = int.tryParse(faltanCtrl.text.trim()) ?? 0;
    final reales = (hato - faltan).clamp(0, hato);
    final c = simularConteo(reales);
    // La marca 'cam' hace que el gateway lo atribuya a la cámara de la finca.
    final trama = '@ag|GAN|${lote.codigo}|$_parcela|${c.cabezas}|${c.confianza}|cam';

    setState(() => _enviando = true);
    await _s.capturarCampo(trama);
    if (!mounted) return;
    setState(() => _enviando = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Cámara: ${c.cabezas} cabezas '
            '(confianza ${(c.confianza * 100).round()}%)'),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cat = _s.campoCatalogo;
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Campo'),
        backgroundColor: theme.colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.sync),
            tooltip: 'Actualizar catálogo',
            onPressed: _s.isConnected ? _pedirCatalogo : null,
          ),
        ],
      ),
      body: cat == null || cat.vacio
          ? _SinCatalogo(
              conectado: _s.isConnected,
              onPedir: _pedirCatalogo,
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _Encabezado(catalogo: cat, pendientes: _s.campoPendientesCount),
                const SizedBox(height: 16),

                Text('¿Qué vas a registrar?', style: theme.textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final t in CampoTipo.values)
                      ChoiceChip(
                        avatar: Icon(t.icono, size: 18),
                        label: Text(t.label),
                        selected: _tipo == t,
                        onSelected: (_) => setState(() {
                          _tipo = t;
                          _valorCtrl.clear();
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 20),

                DropdownButtonFormField<String>(
                  initialValue: _lote,
                  decoration: const InputDecoration(
                    labelText: 'Lote',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    for (final l in cat.lotes)
                      DropdownMenuItem(value: l.codigo, child: Text(l.etiqueta)),
                  ],
                  onChanged: (v) => setState(() {
                    _lote = v;
                    _parcela = null; // las parcelas dependen del lote
                  }),
                ),
                const SizedBox(height: 12),

                DropdownButtonFormField<String>(
                  initialValue: _parcela,
                  decoration: const InputDecoration(
                    labelText: 'Parcela',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    for (final p in (_loteSel?.parcelas ?? const <String>[]))
                      DropdownMenuItem(value: p, child: Text(p)),
                  ],
                  onChanged: _loteSel == null
                      ? null
                      : (v) => setState(() => _parcela = v),
                ),
                const SizedBox(height: 12),

                if (_tipo == CampoTipo.plg) ...[
                  DropdownButtonFormField<String>(
                    initialValue: _plaga,
                    decoration: const InputDecoration(
                      labelText: 'Plaga',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final e in cat.plagas.entries)
                        DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: (v) => setState(() => _plaga = v),
                  ),
                  const SizedBox(height: 16),
                  Text('Severidad', style: theme.textTheme.titleSmall),
                  const SizedBox(height: 8),
                  SegmentedButton<int>(
                    segments: const [
                      ButtonSegment(value: 1, label: Text('1')),
                      ButtonSegment(value: 2, label: Text('2')),
                      ButtonSegment(value: 3, label: Text('3')),
                      ButtonSegment(value: 4, label: Text('4')),
                      ButtonSegment(value: 5, label: Text('5')),
                    ],
                    selected: {_severidad},
                    onSelectionChanged: (s) =>
                        setState(() => _severidad = s.first),
                  ),
                ] else
                  TextField(
                    controller: _valorCtrl,
                    keyboardType: TextInputType.numberWithOptions(
                        decimal: _tipo.admiteDecimales),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                        _tipo.admiteDecimales
                            ? RegExp(r'[0-9.,]')
                            : RegExp(r'[0-9]'),
                      ),
                    ],
                    style: const TextStyle(fontSize: 28),
                    decoration: InputDecoration(
                      labelText: _etiquetaValor(),
                      border: const OutlineInputBorder(),
                      suffixText: _sufijoValor(),
                    ),
                  ),

                // La cámara del potrero: el dato sale por la mesh desde este
                // nodo, igual que saldría desde una cámara instalada allá.
                if (_tipo == CampoTipo.gan) ...[
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _loteSel == null || _parcela == null
                        ? null
                        : _abrirSimuladorCamara,
                    icon: const Icon(Icons.videocam_outlined),
                    label: const Text('Simular conteo de cámara'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                  if (_loteSel != null && _loteSel!.hatoEsperado == null)
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text(
                        'Este lote no tiene cabezas esperadas configuradas; '
                        'el conteo saldrá sin comparación.',
                        style: TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ),
                ],

                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _enviando ? null : _enviar,
                  icon: _enviando
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send),
                  label: Text(_enviando ? 'Enviando…' : 'Registrar'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                ),

                if (_s.campoResultado != null) ...[
                  const SizedBox(height: 16),
                  _Acuse(resultado: _s.campoResultado!),
                ],
              ],
            ),
    );
  }

  String _etiquetaValor() {
    switch (_tipo) {
      case CampoTipo.frj:
        return 'Frutos contados';
      case CampoTipo.jor:
        return 'Peso recogido';
      case CampoTipo.cen:
        return 'Cantidad';
      case CampoTipo.gan:
        return 'Cabezas contadas';
      case CampoTipo.plg:
        return '';
    }
  }

  String? _sufijoValor() => _tipo.unidad.isEmpty ? null : _tipo.unidad;
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({required this.catalogo, required this.pendientes});

  final CampoCatalogo catalogo;
  final int pendientes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: const Icon(Icons.agriculture),
        title: Text(catalogo.fincaNombre),
        subtitle: Text('${catalogo.lotes.length} lotes · '
            '${catalogo.lotes.fold<int>(0, (a, l) => a + l.parcelas.length)} parcelas'),
        trailing: pendientes == 0
            ? null
            : Chip(
                avatar: const Icon(Icons.schedule, size: 16),
                label: Text('$pendientes'),
                backgroundColor: theme.colorScheme.tertiaryContainer,
              ),
      ),
    );
  }
}

class _Acuse extends StatelessWidget {
  const _Acuse({required this.resultado});

  final CampoResultado resultado;

  @override
  Widget build(BuildContext context) {
    final ok = resultado.ok;
    final color = ok ? Colors.green : Colors.red;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        border: Border.all(color: color.withValues(alpha: 0.45)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(ok ? Icons.check_circle : Icons.error, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ok ? 'Recibido por el gateway' : 'Rechazado',
                    style: TextStyle(
                        fontWeight: FontWeight.w600, color: color)),
                Text(resultado.texto,
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SinCatalogo extends StatelessWidget {
  const _SinCatalogo({required this.conectado, required this.onPedir});

  final bool conectado;
  final VoidCallback onPedir;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.agriculture_outlined, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              conectado
                  ? 'Pide el catálogo de tu finca al gateway. Se guarda en el '
                      'teléfono y luego funciona sin señal.'
                  : 'Conéctate a la malla para descargar el catálogo de tu '
                      'finca. Solo hace falta una vez.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: conectado ? onPedir : null,
              icon: const Icon(Icons.download),
              label: const Text('Descargar catálogo'),
            ),
          ],
        ),
      ),
    );
  }
}
