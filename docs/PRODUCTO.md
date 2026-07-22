# Trama — qué es, qué hace y por qué funciona

> Documento de producto: la historia completa, para extraer material de venta.
> Para **demostrarlo** ver [`DEMO.md`](DEMO.md) · para **montarlo**
> [`REPLICAR.md`](REPLICAR.md) · el detalle técnico del agro, [`CAMPO.md`](CAMPO.md).

---

## En una frase

**Una sola conexión a internet, repartida por radio a toda una finca —
para que los datos del campo lleguen en segundos y no en días.**

---

## El problema

En una finca, una obra o un puesto de salud rural, el problema **no es que falte
información**. Es que llega tarde.

El operario cuenta, pesa o revisa donde **no hay señal**. Lo apunta en un papel,
o en una app que promete sincronizar «cuando haya cobertura». Ese papel viaja en
el bolsillo hasta la casa, alguien lo transcribe por la noche —si no se mojó, si
se entiende la letra— y el que decide lo ve al día siguiente. O el viernes.

Para entonces ya pagó la nómina con un conteo que nadie verificó, la plaga
avanzó tres días, y las reses que faltaban llevan tres días faltando.

**La cobertura celular no va a llegar.** No es un problema de tiempo: a un
operador no le sale la cuenta poner una torre para doscientas personas
dispersas en montaña. Y el satélite resuelve *un punto*, no a la gente que se
mueve por veinte mil hectáreas.

---

## La magia: qué hicimos distinto

La idea que lo cambia todo es un cambio de pregunta.

Todo el mundo intenta **llevar internet a cada persona del campo**. Eso es caro,
frágil y en muchos sitios imposible.

Nosotros llevamos **internet a un solo punto** y repartimos por radio **los
mensajes**, no el ancho de banda.

```
        ☁️  Internet  (Starlink, satelital o un celular)
             │
             ▼
        🏠  Gateway  ── la ÚNICA pieza que necesita conexión
             │
        📡  LoRa — radio de largo alcance, bajísimo consumo
       ╱     │     ╲
     📱     📱      📱   ← teléfonos SIN señal, SIN plan de datos
```

La clave está en lo que descubrimos al construirlo:

> ## La mayoría de las decisiones del campo caben en 200 bytes.

«Recogí 38,5 kilos». «Hay broca en el lote 3, severidad 4». «Cuento 117 reses de
120». «¿Cuándo llueve el jueves?».

Nada de eso necesita banda ancha. Necesita **llegar**. Y LoRa —que no sirve para
ver un video— es excelente llevando doscientos bytes a kilómetros de distancia,
con una batería que dura días y sin pagarle a nadie por el espectro.

Ese es el producto: **no vendemos conectividad, vendemos que el dato llegue.**

---

## Qué hace hoy (todo construido y probado)

### 📋 Captura de datos en campo

El operario registra en su teléfono **sin ninguna señal**. Elige de listas —
nunca teclea códigos — y el dato sale por radio.

| Qué captura | Para qué sirve |
|---|---|
| **Conteo de frutos** | Estimar cosecha antes de recogerla |
| **Jornal por peso** | Pagarle a cada quien lo que recogió, el mismo día |
| **Plagas** | Un foco detectado hoy, no el viernes |
| **Censo de producción** | Cuánto salió de cada lote |
| **Conteo de ganado** | Cuántas cabezas hay — y cuántas faltan |

Si el teléfono está fuera del alcance de la malla, **el dato se guarda y sale
solo** cuando vuelve. Nada se pierde por caminar demasiado lejos.

### 🐄 Conteo de ganado por cámara

Una cámara en el potrero cuenta y manda por radio **solo el número**:
«117 cabezas, confianza 0,93» — unos 20 bytes.

**El video nunca viaja.** Por eso funciona donde no hay ancho de banda. Y como
el sistema sabe cuántas cabezas debería haber, no informa un número: informa una
respuesta. **«Faltan 3 reses en el Potrero Norte.»**

Robo, extravío o un animal apartado por enfermedad. Hoy el ganadero se entera
días después.

> Estado: la arquitectura y el flujo completo están construidos y probados; la
> inferencia sobre video de una cámara física es lo único que falta. Se demuestra
> con un simulador que recorre exactamente el mismo camino.

### 📊 El panel en vivo

Quien decide ve, en el momento:

- **Mapa satelital** con cada lote y dónde se tomó cada dato
- **Feed en vivo** que destella cuando entra una captura
- **Indicadores del día**: kilos, pago, focos de plaga, último conteo
- **Alertas** de reses faltantes

Y un **simulador de escenarios**: con los datos reales que acaban de entrar,
mueves los supuestos —recolectores, precio del kilo, tarifa— y ves tu cosecha,
tu nómina y **cuánto se te va al mes por un descuadre del conteo manual**.

### 💬 Chat entre toda la gente del campo

Mensajes entre nodos por radio, en canal privado cifrado. Sin celular, sin
internet, sin costo por mensaje. Es la base sobre la que va todo lo demás.

### 🌍 Puente con el mundo (familia)

Alguien en campo —sin internet— **conversa con su familia**, que sí lo tiene. El
gateway hace de puente en ambos sentidos. Si el internet del gateway se cae, los
mensajes se encolan y se entregan cuando vuelve.

Para quien trabaja aislado semanas, esto no es una función: es la razón de
quedarse en el trabajo.

### 🤖 Inteligencia artificial por radio

Se escribe `@claude <pregunta>` desde un teléfono **sin señal** y llega la
respuesta por radio. Con búsqueda en internet y memoria de la conversación.

Clima, precios, una duda técnica, cómo se trata una plaga. El gateway consulta y
devuelve la respuesta fragmentada en paquetes.

### ✉️ Correo desde la mesh

Enviar un correo real desde el campo, sin internet en el teléfono.

### 🗂️ Los datos donde el cliente ya trabaja

Todo se refleja automáticamente en **Airtable** — una hoja que cualquiera
entiende. Los datos del cliente no quedan encerrados en nuestra herramienta.

---

## Las cifras — medidas, no prometidas

Esto es lo que más vale en una conversación de venta: **no son estimaciones**.

| | |
|---|---|
| **5 segundos** | Desde que el operario pulsa «registrar» en un teléfono sin señal hasta que el dato está en la nube y en Airtable. Medido en campo con la unidad armada. |
| **~200 bytes** | Lo que ocupa un dato de campo. Cabe en un solo paquete de radio. |
| **20 bytes** | Lo que ocupa un conteo de ganado completo, con su nivel de confianza. |
| **0 pesos** | Costo por mensaje. No hay plan de datos ni operador. |
| **1** | Conexiones a internet necesarias para toda la operación. |

El panel calcula esa demora **solo**, sobre datos reales. En la demo no se
enseña un folleto: se enseña el cronómetro.

---

## Por qué funciona donde nada funciona

- **LoRa alcanza kilómetros** con muy poca potencia, porque transmite poquísimos
  datos muy despacio. Es la física a nuestro favor: renunciamos al ancho de
  banda y ganamos alcance y batería.
- **Cada nodo repite.** No hay una torre que si cae deja a todos incomunicados:
  la señal salta de equipo en equipo.
- **Batería de días**, no de horas. Y funciona con panel solar.
- **Espectro libre.** No hay que pedirle permiso ni pagarle a ningún operador.
- **Canal privado cifrado (AES-256)** por cliente. Los datos de una finca no los
  ve nadie más — ni siquiera otra finca nuestra.

---

## Lo que NO hace (dilo tú antes de que lo pregunten)

Esta sección es la más valiosa del documento. **Cada promesa de más se paga en
la implantación**, y un vendedor que reconoce límites genera más confianza que
uno que promete todo.

- **No es internet en el campo.** No se navega, no hay WhatsApp, no hay video.
  Es una red de **mensajes y datos**.
- **No transmite imágenes.** La cámara de ganado manda el número, nunca la foto.
  Esa es precisamente la razón de que funcione.
- **No es telemetría continua.** Sirve para decenas de eventos por hora, no para
  un sensor por segundo. La radio tiene límites legales de uso del aire.
- **El alcance depende del terreno.** Kilómetros en llano con línea de vista;
  bastante menos en montaña cerrada o selva densa. Si preguntan por su finca:
  *«hay que medirlo allá»* — y es verdad.
- **Sin internet en el gateway no hay nube.** La captura por radio sigue
  funcionando y se encola, pero el panel en vivo necesita esa única conexión.
- **El simulador de escenarios es una estimación**, no sirve para liquidar
  nómina. Está escrito en la propia pantalla.

---

## La unidad

Lo que se lleva a una finca cabe en un maletín:

| Pieza | Qué hace |
|---|---|
| **Gateway** (Raspberry Pi con pantalla) | El cerebro. La única pieza con internet. |
| **Nodo central** | La radio del gateway, conectada por USB. |
| **Nodos móviles** | Uno por persona o vehículo. Batería y GPS propios. |
| **Salida a internet** | Starlink, satelital o un simple celular. |

Sorprende lo pequeño que es. Enseñarlo es parte de la demo.

---

## Cómo se implanta

Casi todo se copia; **el trabajo a la medida es entender la finca del cliente**:

1. **Escuchar.** Cómo llaman a sus divisiones —lote, suerte, tablón, potrero—,
   qué cultivan, qué plagas les preocupan, cuánto pagan por kilo. Se usa **su
   vocabulario**, no el nuestro.
2. **Levantar el mapa.** Marcar cada lote sobre el mapa satelital, desde la
   webapp. Sin escribir una línea de código.
3. **Asignar los equipos.** Cada radio queda asociada a una persona. Eso es lo
   que permite liquidar el jornal sin mandar cédulas por el aire.
4. **Entregar y acompañar.** La app se instala escaneando un código QR.

Un cliente nuevo **no requiere programar nada**. El catálogo se levanta desde la
web y cada cliente queda aislado: sus datos no los ve ningún otro, y eso lo
garantiza la base de datos, no una promesa.

---

## Contra qué compite

| Alternativa | Su problema |
|---|---|
| **Papel y planilla** | Llega tarde, se transcribe a mano, se pierde, no se audita |
| **Apps que «sincronizan luego»** | El dato existe pero nadie lo ve hasta que el operario vuelve a cobertura. La demora es la misma. |
| **Cobertura celular** | No va a llegar; a nadie le sale la cuenta |
| **Satélite por persona** | Costo por equipo y por plan, inviable para veinte trabajadores |
| **Radios de voz** | Comunican, pero no dejan dato: nadie puede sumar lo que se dijo por radio |

Nuestro lugar es preciso: **el único que hace que el dato del campo esté en la
nube en segundos, sin darle conectividad a cada persona.**

---

## Frases que puedes usar (y son ciertas)

Para pitch, folleto o web:

> **«Una sola conexión a internet. Toda una región conectada.»**

> **«La mayoría de las decisiones del campo caben en 200 bytes.»**

> **«No le llevamos internet a su gente. Le llevamos los datos de su gente.»**

> **«Cinco segundos. Hoy eso le llega mañana.»**

> **«El video nunca viaja. Solo el dato. Por eso funciona donde no hay señal.»**

> **«Esto no le va a hacer producir más café. Va a hacer que sepa hoy lo que hoy
> pasó, y que le pague a cada quien exactamente lo que recogió.»**

> **«No le informamos que hay 117 reses. Le avisamos que faltan 3.»**

Y para la objeción de siempre —*«¿y eso funciona en mi finca?»*:

> **«Hay que medirlo allá. Vamos, lo medimos, y si no da, se lo digo.»**

---

## Hacia dónde puede crecer

Lo construido es agroindustria, pero la base —mensajes y datos donde no hay
señal— sirve para más:

- **Seguridad y control de acceso** en fincas y obras
- **Emergencias**: cuadrillas coordinadas donde se cayó todo
- **Salud rural**: reportes desde puestos aislados
- **Logística en zonas muertas**: minería, forestal, obra civil
- **Sensores**: humedad, nivel de tanques, cercas eléctricas — cualquier cosa
  cuyo estado quepa en pocos bytes

El patrón se repite: **si el dato es pequeño y llegar importa, esto encaja.**

---

## El resumen para una diapositiva

**Problema** · En el campo los datos llegan tarde. La cobertura no va a llegar.

**Solución** · Una conexión a internet repartida por radio de largo alcance a
toda la finca.

**Cómo** · El operario captura en un teléfono sin señal. El dato viaja por LoRa
al gateway y de ahí a la nube.

**Prueba** · 5 segundos, medidos. Hoy: horas o días.

**Valor** · Pagar bien, detectar a tiempo, decidir con lo que pasó hoy.
