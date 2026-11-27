/** Revisión humana: notas del comité, historial automático y cierre del proceso. */
import { useState } from 'react';
import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, CampoDeTexto, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';
import { type Proyecto, transicionarProyectoApi } from '@/features/proyectos/api';
import { formatoFechaHora } from '@/features/proyectos/estados';

import { anotarApi, etiquetaDeAccion, historialApi, notasApi } from './api';

export function Revision({ proyecto, onCambio }: { proyecto: Proyecto; onCambio: (p: Proyecto) => void }) {
  const { usuario, conSesion } = useSesion();
  const notas = useDatos(notasApi(proyecto.id), proyecto.id);
  const historial = useDatos(historialApi(proyecto.id), proyecto.id);
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  const [confirmAward, setConfirmAward] = useState(false);
  const canAward = usuario?.rol === 'aprobador' && proyecto.estado === 'en_revision_del_comite';
  const puedeAnotar = usuario?.rol === 'evaluador' || usuario?.rol === 'aprobador';
  const puedeCerrar = usuario?.rol === 'aprobador' && proyecto.estado !== 'cerrado' && proyecto.estado !== 'en_evaluacion';

  const ejecutar = async (accion: () => Promise<void>) => {
    try {
      await accion();
      setFallo(null);
      notas.recargar();
      historial.recargar();
    } catch (e) {
      setFallo(mensajeDeError(e));
    }
  };

  return (
    <View style={{ gap: espacio.md }}>
      {fallo ? <Aviso texto={fallo} /> : null}
      <CollapsibleCard title="Notas del comité" detail={notas.datos ? `${notas.datos.length} nota(s)` : undefined} defaultOpen>
        {puedeAnotar ? (
          <View style={{ gap: espacio.sm }}>
            <CampoDeTexto etiqueta="Nueva nota" multiline value={texto} onChangeText={setTexto} maxLength={2000} />
            <Boton etiqueta="Agregar nota" icono="message-circle" deshabilitado={!texto.trim()}
              onPress={() => ejecutar(async () => { await conSesion(anotarApi(proyecto.id, texto)); setTexto(''); })} />
          </View>
        ) : null}
        {notas.error ? <ErrorConReintento texto={notas.error} onReintentar={notas.recargar} /> : null}
        {notas.datos?.length === 0 ? <Texto suave>Todavía no hay notas.</Texto> : null}
        {notas.datos?.map((n) => <Fila key={n.id} icono="message-circle" titulo={n.texto} detalle={`${n.autor} · ${formatoFechaHora(n.creado)}`} />)}
      </CollapsibleCard>

      {canAward ? (
        <CollapsibleCard title="Adjudicar el proyecto" detail="La decisión es del comité: revise antes el ranking y la evidencia.">
          <Boton etiqueta={confirmAward ? 'Confirmar adjudicación' : 'Marcar como adjudicado'} icono="award"
            onPress={() => {
              if (!confirmAward) return setConfirmAward(true);
              setConfirmAward(false);
              void ejecutar(async () => onCambio(await conSesion(transicionarProyectoApi(proyecto.id, 'adjudicado', null))));
            }} />
          <Texto variante="pequeno" suave>Para indicar el proveedor elegido y el motivo, agregue una nota del comité.</Texto>
        </CollapsibleCard>
      ) : null}

      {puedeCerrar ? (
        <CollapsibleCard title="Cerrar el proceso" detail={proyecto.estado === 'adjudicado' ? 'El proceso ya fue adjudicado.' : 'Cerrar sin adjudicar exige un motivo.'}>
          <CampoDeTexto etiqueta="Motivo" value={motivo} onChangeText={setMotivo} maxLength={500} />
          <Boton etiqueta="Cerrar proceso" variante="secundario" icono="lock" deshabilitado={proyecto.estado !== 'adjudicado' && !motivo.trim()}
            onPress={() => ejecutar(async () => onCambio(await conSesion(transicionarProyectoApi(proyecto.id, 'cerrado', motivo || null))))} />
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard title="Historial de cambios" detail="Se registra automáticamente">
        {historial.error ? <ErrorConReintento texto={historial.error} onReintentar={historial.recargar} /> : null}
        {!historial.datos && !historial.error ? <Cargando /> : null}
        {historial.datos?.map((e) => <Fila key={e.id} icono="clock" titulo={etiquetaDeAccion(e.accion)} detalle={`${e.actor} · ${formatoFechaHora(e.creado)}`} />)}
      </CollapsibleCard>
    </View>
  );
}
