# Guion de demostración — unidad portátil Trama

> Para ejecutar delante de un cliente. Duración: **15–20 minutos**.
> El manual para montar una unidad nueva es [`REPLICAR.md`](REPLICAR.md).

La demo tiene **un solo momento decisivo**: alguien se aleja hasta donde no hay
señal, registra un dato en el teléfono, y ese dato aparece en la pantalla del
cliente en segundos. Todo lo demás es preparación y cierre. No lo diluyas.

---

## Antes de salir (30 minutos antes)

Haz esto **completo**, en orden. Cada casilla existe porque algo falló alguna vez.

### Energía
- [ ] Pi cargada o con corriente asegurada en el sitio
- [ ] Nodos móviles cargados (los T1000-E se descargan solos en días)
- [ ] Teléfono al 100 % (el Bluetooth constante consume)
- [ ] Batería externa de respaldo

### Gateway
- [ ] Enciende la Pi y espera 2 minutos
- [ ] `ssh pfac@pi4-meshportatil-show 'systemctl is-active mesh-portatil-gateway'` → `active`
- [ ] **Internet en la Pi** — el fallo más probable fuera de casa. La unidad
      lleva pantalla y teclado: al llegar al sitio, únete a la red de allá
      (queda guardada para la próxima) y comprueba:
      `getent hosts api.anthropic.com` → debe devolver una IP.
      Si no resuelve, mira "DNS" en las averías de abajo.
- [ ] El Central enumera: `ls /dev/ttyACM0` (si no, revisa el cable — ver averías)
- [ ] Sin errores: `sudo journalctl -u mesh-portatil-gateway --since '5 min ago' | grep ERROR`

### Nodos
- [ ] Enciende los nodos que vas a usar y **confirma que la malla los OYE**.
      No basta con que salgan en la lista: mira el «visto hace» en la tabla
      `nodes`. Si dice horas, ese nodo está guardado en el catálogo del Central
      pero **no está vivo** — un nodo recién encendido se anuncia en segundos.
      Suele ser batería: los T1000-E se agotan en días.
- [ ] Comprueba que el nodo al que conectas el teléfono pertenece a la finca
      **que vas a demostrar**. Un nodo de la finca de café no tiene potreros ni
      cámara, así que el conteo de ganado entra pero sin alerta.
- [ ] **Comprueba que el nodo del teléfono esté registrado como operario.**
      Si no, el gateway responderá *"sin operario registrado"*. Es correcto —
      el nodo identifica a quién se le paga — pero arruina la demo.

### App
- [ ] APK instalado (el que tenga la pestaña **Campo**)
- [ ] Emparejada por Bluetooth al nodo correcto
- [ ] **Descarga el catálogo AHORA**, no delante del cliente: pestaña Campo →
      "Descargar catálogo". Queda guardado en el teléfono. Así, si la radio se
      pone lenta durante la demo, los formularios ya están listos.

### Pantalla del cliente
- [ ] `/campo` abierto y con sesión iniciada
- [ ] **Genera datos de demostración** (`/campo/analisis` → "Generar 60
      capturas") para que el panel no aparezca vacío. Un panel vacío no vende.
- [ ] Ten `/campo/analisis` en otra pestaña, lista

### Ensayo
- [ ] **Haz una captura de prueba tú mismo** y compruébala de punta a punta.
      Bórrala después si molesta. Nunca estrenes la cadena delante del cliente.

---

## El guion

### 1. El problema (2 min) — sin pantallas

Habla, no muestres nada todavía. Pregunta y escucha:

> *"¿Cómo se enteran hoy de cuánto recogió cada persona? ¿Y cuánto tardan en
> saberlo?"*

Deja que lo digan ellos. La respuesta siempre es alguna versión de: **papel, y
al día siguiente** — o al final de la semana. Ahí ya tienes el problema
planteado con sus palabras, que valen más que las tuyas.

Remata:

> *"El problema no es que no tengan los datos. Es que los tienen tarde, y para
> entonces ya pagaron."*

### 2. La unidad (2 min)

Enseña el equipo físico. Es pequeño y eso sorprende.

> *"Esto es todo. Una Raspberry con una radio, y estos aparatitos que van con la
> gente. No hay antenas, no hay torres, no hay plan de datos. La radio va por
> LoRa: alcance de kilómetros, batería de días."*

Señala que el teléfono del operario **no tiene señal** y aun así funciona.

### 3. La captura en vivo (5 min) — **el momento**

Manda a alguien lo más lejos que se pueda, idealmente fuera de cobertura
celular. Si están en una finca, mejor todavía.

Que registre delante de todos: **Frutos rojos → lote → parcela → 780 →
Registrar.**

Mientras camina, prepara al público:

> *"No tiene señal. No hay wifi. Cuando le dé a registrar, el dato va a salir por
> radio hasta esta caja, y de aquí a la nube. Miren la pantalla."*

Y entonces **cállate y deja que aparezca**. El destello verde en el feed hace el
trabajo. No hables encima del efecto.

Cuando aparezca, una sola frase:

> *"Cinco segundos. Hoy eso les llega mañana."*

### 4. El panel (3 min)

Recorre `/campo`:

- **El mapa**: dónde se tomó cada dato, lote por lote
- **Los indicadores**: jornal del día, pago, focos de plaga
- **El feed**: quién capturó qué y cuándo

> *"Nadie transcribió nada. No hay una planilla que alguien tenga que pasar a un
> computador por la noche."*

### 5. El análisis y el dinero (5 min) — el cierre

Pasa a `/campo/analisis`. Arriba está la **demora medida** — con los datos que
acabas de generar delante de ellos, no un folleto.

Baja al simulador y **déjales mover los controles a ellos**. Pon sus números
reales: cuántos recolectores tienen, qué tarifa pagan.

Cuando el número naranja se mueva, párate ahí:

> *"Esto es lo que se les va al mes si el conteo manual se descuadra un 3 %. No
> es un robo: es gente cansada apuntando en un papel al final del día."*

**Sé honesto con lo que el producto hace y lo que no:**

> *"Esto no les va a hacer producir más café. Lo que hace es que sepan hoy lo que
> hoy pasó, y que le paguen a cada quien exactamente lo que recogió."*

Esa frase vende más que exagerar, y te protege cuando midan resultados.

### 6. Sus datos donde ya trabajan (2 min)

Abre Airtable. Los mismos registros, en una hoja que ya entienden.

> *"Sus datos no se quedan encerrados aquí. Si mañana quieren llevarlos a su
> sistema, ya están en un formato que cualquiera lee."*

### 7. Cierre

Pregunta directa:

> *"¿Qué medirían ustedes primero?"*

Su respuesta es la especificación del piloto. Anótala literal — con eso se arma
el catálogo a la medida (ver [`REPLICAR.md`](REPLICAR.md)).

---

## Si algo falla

Ten esto leído **antes**, no lo consultes delante del cliente.

| Síntoma | Qué pasa | Qué haces |
|---|---|---|
| La app dice *"Sin malla: guardada"* | El teléfono no ve la radio | **No es un fallo, es la función.** Dilo en voz alta: *"Miren: no se perdió, quedó en cola y sale sola cuando vuelva a haber malla."* Acércate y aparece. Es una demo mejor que la original. |
| *"sin operario registrado"* | El nodo del teléfono no está en `campo_operarios` | Cambia a un nodo que sí lo esté. Prevención: verificarlo antes. |
| El dato no aparece en el panel | Casi siempre la Pi se quedó sin internet | Sigue con los datos ya cargados. El dato entrará solo cuando vuelva la conexión — y eso también se cuenta. |
| No hay `/dev/ttyACM0` | Cable USB de solo carga, o mal asentado | Cambia el cable por uno de datos, asiéntalo firme, prueba otro puerto. Después: `sudo systemctl restart mesh-portatil-gateway` |
| El gateway no resuelve dominios | Tailscale se apoderó del DNS | `sudo tailscale set --accept-dns=false` y espera 30 s. Comprueba con `getent hosts api.anthropic.com` |
| `@claude` no responde | Sin internet en la Pi | Salta esa parte. El módulo Campo por LoRa sigue funcionando sin internet. |
| El panel está vacío | No generaste datos de demo | Genera 60 capturas desde `/campo/analisis` |

**Regla general:** si algo se cae, **no lo escondas — explícalo**. Una red que
encola datos cuando se cae y los entrega después es exactamente lo que le estás
vendiendo. Un vendedor nervioso escondiendo una pantalla vende menos que uno
que dice *"miren, esto es lo que pasa cuando se cae, y por eso no se pierde"*.

---

## Después de la demo

- [ ] **Borra los datos de demostración**: `/campo/analisis` → "Borrar datos de
      demostración". Si dejas datos inventados mezclados con los reales, la
      próxima demo miente sin que te des cuenta.
- [ ] Anota qué pidió el cliente (qué mediría primero, qué lotes, qué cultivos)
- [ ] Apaga: `ssh pfac@pi4-meshportatil-show 'sudo poweroff'`
- [ ] Pon a cargar todo

---

## Lo que NO debes prometer

Anótalo y respétalo. Cada promesa de más se paga en la implantación.

- **No es telemetría continua.** LoRa tiene ciclo de trabajo limitado: sirve para
  decenas de eventos por hora, no para un sensor cada segundo.
- **No transmite fotos ni video.** El conteo por cámara manda el *resultado*
  («127 cabezas»), nunca la imagen. Esa es justamente la razón de que funcione.
- **El alcance depende del terreno.** Kilómetros en llano y línea de vista; mucho
  menos en montaña cerrada o selva densa. Si el cliente pregunta por su finca en
  concreto, la respuesta honesta es *"hay que medirlo allá"*.
- **El simulador es una estimación.** No sirve para liquidar nómina. Está escrito
  en la propia pantalla — no lo contradigas de palabra.
- **Sin internet en el gateway no hay nube.** La captura por radio sigue y se
  encola, pero el panel en vivo y `@claude` necesitan una salida a internet.
