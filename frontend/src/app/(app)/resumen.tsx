import { type Href, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { useDatos } from '@/core/useDatos';
import { Cargando, Columna, ErrorConReintento, Fila, Rejilla, TituloDeSeccion } from '@/design/bloques';
import { Boton, EstadoVacio, Insignia, Tarjeta, Texto } from '@/design/componentes';
import { TarjetaDeGrafico } from '@/design/graficos';
import { Metrica, Pagina } from '@/design/layout';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { estadisticasApi, type Estadisticas } from '@/features/gestion/api';
import { porEstado, porFormato } from '@/features/gestion/datosDeGraficos';
import { listarProyectosApi, type Proyecto } from '@/features/proyectos/api';
import { ESTADOS, formatoDinero, formatoFecha, infoEstado, ORDEN_DE_ESTADOS } from '@/features/proyectos/estados';

const cargar = async (token: string): Promise<{ e: Estadisticas; proyectos: Proyecto[] }> => {
  const [e, proyectos] = await Promise.all([estadisticasApi(token), listarProyectosApi(token)]);
  return { e, proyectos };
};

export default function Resumen() {
  const t = useTema();
  const router = useRouter();
  const { usuario } = useSesion();
  const { datos, error, recargar } = useDatos(cargar);
  const puedeCrear = usuario?.rol === 'cargador';
  const abrir = (ruta: string) => router.push(ruta as Href);

  const pendientes = (datos?.proyectos ?? [])
    .filter((p) => p.estado === 'en_recepcion' && (datos?.e.propuestas_por_proyecto[p.id] ?? 0) < 3)
    .slice(0, 4);

  return (
    <Pagina>
      <View style={{ backgroundColor: t.primario, borderRadius: radio.panel, padding: espacio.xl, gap: espacio.md }}>
        <View style={{ alignSelf: 'flex-start', backgroundColor: t.lima, borderRadius: radio.pildora, paddingHorizontal: espacio.md, paddingVertical: espacio.xs }}>
          <Texto variante="sobretitulo" color={t.sobreLima}>
            PANEL DE COMPRAS
          </Texto>
        </View>
        <Texto variante="hero" color="#FFFFFF" accessibilityRole="header">
          Decisiones de compra con evidencia
        </Texto>
        <Texto color="#CBD5E1" style={{ maxWidth: 640 }}>
          Organice cada proceso, reúna las propuestas en un expediente cifrado y deje registro de cada acción del comité.
        </Texto>
        <View style={{ flexDirection: 'row', gap: espacio.sm, flexWrap: 'wrap' }}>
          {puedeCrear ? <Boton etiqueta="Nuevo proyecto" icono="plus" onPress={() => abrir('/proyectos/nuevo')} /> : null}
          <Boton etiqueta="Ver proyectos" variante="secundario" icono="folder" onPress={() => abrir('/proyectos')} />
        </View>
      </View>

      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!datos ? (
        error ? null : <Cargando />
      ) : (
        <View style={{ gap: espacio.xl }}>
          <Rejilla>
            <Metrica etiqueta="Proyectos" valor={datos.e.total_proyectos} icono="folder" />
            <Metrica etiqueta="Propuestas cargadas" valor={datos.e.total_propuestas} icono="file-text" />
            <Metrica etiqueta="Proveedores" valor={datos.e.total_proveedores} icono="briefcase" />
            <Metrica etiqueta="Adjudicados" valor={datos.e.por_estado.adjudicado} icono="award" />
          </Rejilla>

          <Tarjeta>
            <TituloDeSeccion titulo="Flujo del proceso" detalle="Cuántos proyectos hay en cada etapa" />
            <Rejilla>
              {ORDEN_DE_ESTADOS.map((k, i) => (
                <Columna key={k} minimo={140}>
                  <View style={{ borderRadius: radio.lg, backgroundColor: datos.e.por_estado[k] ? t.lima : t.superficieAlta, padding: espacio.md, gap: espacio.xs, flex: 1 }}>
                    <Texto variante="sobretitulo">PASO {i + 1}</Texto>
                    <Texto variante="metrica">{datos.e.por_estado[k]}</Texto>
                    <Texto variante="etiqueta">{ESTADOS[k].etiqueta}</Texto>
                  </View>
                </Columna>
              ))}
            </Rejilla>
          </Tarjeta>

          {datos.proyectos.length === 0 ? (
            <EstadoVacio
              icono="folder-plus"
              titulo="Empiece con su primer proyecto"
              descripcion={puedeCrear ? 'Cree el proyecto y cargue de 3 a 20 propuestas.' : 'Un usuario con rol Cargador debe crear el primer proyecto.'}
              accion={puedeCrear ? <Boton etiqueta="Crear proyecto" icono="plus" onPress={() => abrir('/proyectos/nuevo')} /> : undefined}
            />
          ) : (
            <Rejilla>
              <Columna>
                <TarjetaDeGrafico titulo="Proyectos por estado" unidad="proyectos" datos={porEstado(datos.e)} />
              </Columna>
              <Columna>
                <TarjetaDeGrafico titulo="Propuestas por formato" unidad="propuestas" forma="columnas" datos={porFormato(datos.e)} vacio="Cargue propuestas en un proyecto para ver su distribución." />
              </Columna>
              <Columna>
                <Tarjeta style={{ flex: 1 }}>
                  <TituloDeSeccion titulo="Actividad reciente" />
                  {datos.proyectos.slice(0, 4).map((p) => (
                    <Pressable key={p.id} accessibilityRole="link" onPress={() => abrir(`/proyectos/${p.id}`)}>
                      <Fila icono="folder" titulo={p.nombre} detalle={`${formatoFecha(p.creado)} · ${formatoDinero(p.presupuesto_referencial, p.moneda)}`}
                        derecha={<Insignia etiqueta={infoEstado(p.estado).etiqueta} tono={infoEstado(p.estado).tono} />} />
                    </Pressable>
                  ))}
                </Tarjeta>
              </Columna>
              <Columna>
                <Tarjeta style={{ flex: 1 }}>
                  <TituloDeSeccion titulo="Pendientes" detalle="En recepción con menos de 3 propuestas" />
                  {pendientes.length === 0 ? (
                    <Texto suave>No hay expedientes incompletos.</Texto>
                  ) : (
                    pendientes.map((p) => (
                      <Pressable key={p.id} accessibilityRole="link" onPress={() => abrir(`/proyectos/${p.id}`)}>
                        <Fila icono="alert-circle" titulo={p.nombre} detalle={`${datos.e.propuestas_por_proyecto[p.id] ?? 0} de 3 propuestas mínimas`} />
                      </Pressable>
                    ))
                  )}
                </Tarjeta>
              </Columna>
            </Rejilla>
          )}
        </View>
      )}
    </Pagina>
  );
}
