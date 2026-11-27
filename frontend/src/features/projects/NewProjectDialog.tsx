/** New project form inside a lightbox, so creating one never leaves the current screen. */
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';
import { Aviso } from '@/design/bloques';
import { Boton, CampoDeTexto, Chip, Texto } from '@/design/componentes';
import { Lightbox } from '@/design/Lightbox';
import { espacio } from '@/design/tokens';
import { crearProyectoApi, type Moneda } from '@/core/api/projects';
import { parsearMonto } from '@/core/amount';

type Errors = { name?: string; requirement?: string; location?: string; budget?: string; general?: string };

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { conSesion } = useSesion();
  const [name, setName] = useState('');
  const [requirement, setRequirement] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState<Moneda>('USD');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const validate = (): Errors => {
    const found: Errors = {};
    if (name.trim().length < 3) found.name = 'Escriba al menos 3 caracteres.';
    if (!requirement.trim()) found.requirement = 'Describa lo que se requiere adquirir.';
    if (!location.trim()) found.location = 'Indique la ubicación.';
    if (budget.trim() && !((parsearMonto(budget) ?? 0) > 0)) found.budget = 'Ingrese un monto mayor que cero.';
    return found;
  };

  const save = async () => {
    if (busy) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const project = await conSesion(
        crearProyectoApi({
          nombre: name.trim(),
          requerimiento: requirement.trim(),
          ubicacion: location.trim(),
          moneda: currency,
          presupuesto_referencial: budget.trim() ? parsearMonto(budget) : null,
        }),
      );
      onClose();
      router.push(`/proyectos/${project.id}` as Href);
    } catch (e) {
      setErrors({
        general:
          e instanceof ErrorApi
            ? e.estado === 403
              ? 'Su rol no puede crear proyectos.'
              : `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}`
            : 'Error inesperado.',
      });
      setBusy(false);
    }
  };

  return (
    <>
      <CampoDeTexto etiqueta="Nombre del proyecto" icono="type" value={name} onChangeText={setName} error={errors.name} maxLength={120} autoFocus />
      <CampoDeTexto etiqueta="Ubicación" icono="map-pin" value={location} onChangeText={setLocation} error={errors.location} maxLength={200} />
      <CampoDeTexto etiqueta="Requerimiento" icono="file-text" value={requirement} onChangeText={setRequirement} error={errors.requirement} ayuda="Equipos, cantidades y condiciones (instalación, garantía, soporte)." multiline minLinesHeight={112} maxLength={5000} />
      <CampoDeTexto etiqueta="Presupuesto referencial (opcional)" icono="dollar-sign" value={budget} onChangeText={setBudget} error={errors.budget} keyboardType="decimal-pad" ayuda="Solo como referencia; no descarta propuestas por sí solo." />
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm, alignItems: 'center' }}>
        <Texto variante="etiqueta">Moneda</Texto>
        {(['USD', 'VES'] as const).map((c) => (
          <Chip key={c} etiqueta={c === 'VES' ? 'Bolívares (VES)' : 'Dólares (USD)'} seleccionado={currency === c} onPress={() => setCurrency(c)} />
        ))}
      </View>
      {errors.general ? <Aviso texto={errors.general} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espacio.sm }}>
        <Boton etiqueta="Cancelar" variante="secundario" onPress={onClose} deshabilitado={busy} />
        <Boton etiqueta="Crear proyecto" icono="check" onPress={save} cargando={busy} />
      </View>
    </>
  );
}

export function NewProjectDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Lightbox visible={visible} title="Nuevo proyecto" description="Defina qué se va a adquirir. Después podrá cargar las propuestas." onClose={onClose}>
      <NewProjectForm onClose={onClose} />
    </Lightbox>
  );
}
