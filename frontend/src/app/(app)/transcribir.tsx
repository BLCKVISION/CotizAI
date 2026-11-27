import { useState } from 'react';
import { View } from 'react-native';

import { pickFiles } from '@/core/files';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { Aviso, Cargando } from '@/design/bloques';
import { Boton, EstadoVacio, Tarjeta, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { espacio } from '@/design/tokens';
import { type Transcripcion, transcribirImagenApi } from '@/core/api/transcription';
import { VistaTranscripcion } from '@/design/MarkdownView';
import { isTooLarge, MAX_FILE_LABEL, tooLargeMessage } from '@/core/uploads/limits';

// Propia de esta pantalla: ACCEPT_PHOTOS la comparten las subidas de propuestas, que no contemplan WebP en sus estadísticas.
const ACEPTAR_IMAGENES = '.jpg,.jpeg,.png,.webp';

type Estado =
  | { fase: 'inicial' }
  | { fase: 'cargando'; nombre: string }
  | { fase: 'listo'; nombre: string; resultado: Transcripcion }
  | { fase: 'error'; mensaje: string; archivo?: File };

export default function Transcribir() {
  const { conSesion } = useSesion();
  const [estado, setEstado] = useState<Estado>({ fase: 'inicial' });
  const [copia, setCopia] = useState<'ok' | 'fallo' | null>(null);

  const transcribir = async (archivo: File) => {
    if (isTooLarge(archivo.size)) {
      return setEstado({ fase: 'error', mensaje: tooLargeMessage(archivo.size) });
    }
    setCopia(null);
    setEstado({ fase: 'cargando', nombre: archivo.name });
    try {
      const resultado = await conSesion(transcribirImagenApi(archivo.name, archivo));
      setEstado({ fase: 'listo', nombre: archivo.name, resultado });
    } catch (e) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(e), archivo });
    }
  };

  const elegir = () => pickFiles(ACEPTAR_IMAGENES, (archivos) => archivos[0] && void transcribir(archivos[0]));

  const copiar = async (markdown: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopia('ok');
    } catch {
      setCopia('fallo'); // sin permiso de portapapeles (p. ej. contexto no seguro): el texto sigue visible para copiarlo a mano
    }
  };

  const ocupado = estado.fase === 'cargando';

  return (
    <Pagina>
      <EncabezadoDePagina
        sobretitulo="Herramientas"
        titulo="Transcribir presupuesto"
        descripcion="Suba la foto o captura de un presupuesto y obtenga su contenido en Markdown. Las cifras dudosas se marcan para revisión."
        accion={<Boton etiqueta={estado.fase === 'listo' ? 'Otra imagen' : 'Elegir imagen'} icono="upload" onPress={elegir} deshabilitado={ocupado} />}
      />

      {estado.fase === 'inicial' ? (
        <EstadoVacio
          icono="image"
          titulo="Aún no hay ninguna imagen"
          descripcion={`Formatos admitidos: JPG, PNG y WebP, máximo ${MAX_FILE_LABEL}. Funciona también con fotos algo borrosas.`}
          accion={<Boton etiqueta="Elegir imagen" icono="upload" onPress={elegir} />}
        />
      ) : null}

      {estado.fase === 'cargando' ? (
        <View style={{ gap: espacio.md }}>
          <Texto suave>Transcribiendo «{estado.nombre}»… puede tardar unos segundos.</Texto>
          <Cargando />
        </View>
      ) : null}

      {estado.fase === 'error' ? (
        <Aviso
          texto={estado.mensaje}
          accion={estado.archivo ? <Boton etiqueta="Reintentar" icono="refresh-cw" variante="secundario" onPress={() => void transcribir(estado.archivo as File)} /> : undefined}
        />
      ) : null}

      {estado.fase === 'listo' ? (
        <Tarjeta>
          <View style={{ gap: espacio.md }}>
            <Texto variante="etiqueta" suave>
              {estado.nombre}
            </Texto>
            <VistaTranscripcion resultado={estado.resultado} />
            <Boton etiqueta="Copiar Markdown" icono="copy" variante="secundario" onPress={() => void copiar(estado.resultado.markdown)} />
            {copia === 'ok' ? <Aviso tono="exito" texto="Markdown copiado al portapapeles." /> : null}
            {copia === 'fallo' ? <Aviso tono="aviso" texto="No se pudo copiar automáticamente. Seleccione el texto y cópielo a mano." /> : null}
          </View>
        </Tarjeta>
      ) : null}
    </Pagina>
  );
}
