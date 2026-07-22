"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Enlace de instalación de la app para pasárselo a un cliente en el momento.
 *
 * Va con código QR porque el caso de uso es estar de pie frente a alguien: que
 * apunte con la cámara es inmediato; dictar una URL de Drive, no.
 *
 * El enlace se puede cambiar sin tocar código con NEXT_PUBLIC_APP_APK_URL
 * (en Vercel), útil cada vez que se publica una versión nueva del APK.
 */
const ENLACE =
  process.env.NEXT_PUBLIC_APP_APK_URL ??
  "https://drive.google.com/file/d/1DI4lGEVxqQMl5NCAB7X0z0q72qNc9eV7/view?usp=sharing";

export default function AppParaCliente() {
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(ENLACE, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b1f33", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(ENLACE);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section className="card rounded-xl p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-100">
        App para el cliente
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        Que apunte la cámara del celular al código. Es Android: al abrirlo tendrá
        que permitir la instalación desde el navegador.
      </p>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-xl bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="Código QR con el enlace de descarga de la app"
              width={176}
              height={176}
              className="block h-44 w-44"
            />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-500">
              Generando…
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
            Enlace
          </p>
          <p className="mb-3 break-all text-xs text-slate-300">{ENLACE}</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copiar}
              className="btn-ghost rounded-lg px-3 py-2 text-xs"
            >
              {copiado ? "✓ Copiado" : "Copiar enlace"}
            </button>
            <a
              href={ENLACE}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost rounded-lg px-3 py-2 text-xs"
            >
              Abrir
            </a>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Para cambiarlo al publicar una versión nueva, edita
            <code className="mx-1 rounded bg-white/10 px-1">
              NEXT_PUBLIC_APP_APK_URL
            </code>
            en Vercel — no hace falta tocar el código.
          </p>
        </div>
      </div>
    </section>
  );
}
