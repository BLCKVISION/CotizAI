/** The team: who works on the purchases, with which role, and what each role may do. */
import { useState } from 'react';
import { View } from 'react-native';

import type { Role } from '@/core/auth/permissions';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, CampoDeTexto, Chip, Insignia, Texto } from '@/design/componentes';
import { ConfirmDialog } from '@/design/ConfirmDialog';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { Lightbox } from '@/design/Lightbox';
import { useTema } from '@/design/tema';
import { showToast } from '@/design/toastStore';
import { espacio } from '@/design/tokens';
import { checkPassword, isEmail, isStrongPassword } from '@/features/auth/passwordRules';
import { addMemberApi, changeMemberApi, type Member, type NewMember, teamApi } from '@/features/team/api';
import { permissionLabel, ROLE_INFO, ROLE_ORDER } from '@/features/team/roles';

const EMPTY: NewMember = { display_name: '', email: '', password: '', role: 'evaluador' };

function RolePicker({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <View style={{ gap: espacio.sm }}>
      <Texto variante="etiqueta">Rol</Texto>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        {ROLE_ORDER.map((role) => (
          <Chip key={role} etiqueta={ROLE_INFO[role].label} seleccionado={value === role} onPress={() => onChange(role)} />
        ))}
      </View>
      <Texto variante="pequeno" suave>
        {ROLE_INFO[value].summary}
      </Texto>
    </View>
  );
}

/** Name and actions wrap onto separate lines when the screen is narrow. */
function MemberRow({ member, canManage, onRole, onToggle }: { member: Member; canManage: boolean; onRole: () => void; onToggle: () => void }) {
  const t = useTema();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.sm, paddingVertical: espacio.sm + 2, borderBottomWidth: 1, borderBottomColor: t.borde }}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 240 }}>
        <Texto variante="etiqueta">{member.display_name || member.email.split('@')[0]}</Texto>
        <Texto variante="pequeno" suave>{`${member.email}${member.is_you ? ' · usted' : ''}`}</Texto>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1, maxWidth: '100%', gap: espacio.sm }}>
        {member.active ? null : <Insignia etiqueta="Desactivada" tono="aviso" />}
        <Insignia etiqueta={ROLE_INFO[member.role]?.label ?? member.role} tono="info" />
        {canManage ? (
          <>
            <Boton etiqueta="Cambiar rol" variante="fantasma" onPress={onRole} />
            <Boton etiqueta={member.active ? 'Desactivar' : 'Activar'} variante="fantasma" onPress={onToggle} />
          </>
        ) : null}
      </View>
    </View>
  );
}

export default function Equipo() {
  const { conSesion } = useSesion();
  const team = useDatos(teamApi);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<{ member: Member; role: Role } | null>(null);
  const [toggling, setToggling] = useState<Member | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (key: 'display_name' | 'email' | 'password') => ({
    value: form[key],
    onChangeText: (value: string) => setForm((f) => ({ ...f, [key]: value })),
  });

  const run = async (action: () => Promise<unknown>, done: string, close: () => void) => {
    setBusy(true);
    try {
      await action();
      setFailure(null);
      close();
      showToast({ tone: 'success', title: done });
      team.recargar();
    } catch (e) {
      setFailure(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (form.display_name.trim().length < 3) return setFailure('Escriba el nombre de la persona.');
    if (!isEmail(form.email)) return setFailure('Escriba un correo válido.');
    if (!isStrongPassword(form.password, form.email)) {
      const missing = checkPassword(form.password, form.email).filter((r) => !r.passes).map((r) => r.label.toLowerCase());
      return setFailure(`A la contraseña le falta: ${missing.join(', ')}.`);
    }
    void run(
      () => conSesion(addMemberApi({ ...form, email: form.email.trim().toLowerCase(), display_name: form.display_name.trim() })),
      'Persona agregada al equipo',
      () => {
        setAdding(false);
        setForm(EMPTY);
      },
    );
  };

  const closeDialogs = () => {
    setAdding(false);
    setEditing(null);
    setForm(EMPTY);
    setFailure(null);
  };

  const data = team.datos;
  return (
    <Pagina>
      <EncabezadoDePagina
        sobretitulo="Equipo"
        titulo="Equipo y roles"
        descripcion="Quién participa en las compras y qué puede hacer cada persona."
        accion={data?.can_manage ? <Boton etiqueta="Agregar persona" icono="plus" onPress={() => setAdding(true)} /> : undefined}
      />
      {team.error ? <ErrorConReintento texto={team.error} onReintentar={team.recargar} /> : null}
      {!data && !team.error ? <Cargando /> : null}
      {failure && !adding && !editing ? <Aviso texto={failure} /> : null}
      {data ? (
        <View style={{ gap: espacio.md }}>
          {data.can_manage ? null : <Aviso tono="info" texto="Solo el rol Coordinador puede agregar personas o cambiar roles." />}
          <CollapsibleCard title="Personas" detail={`${data.members.length} en el equipo`} defaultOpen>
            {data.members.map((m) => (
              <MemberRow key={m.id} member={m} canManage={data.can_manage && !m.is_you} onRole={() => setEditing({ member: m, role: m.role })} onToggle={() => setToggling(m)} />
            ))}
          </CollapsibleCard>
          <CollapsibleCard title="Qué puede hacer cada rol" detail="El servidor aplica estos permisos">
            {ROLE_ORDER.map((role) => {
              const permissions = data.roles.find((r) => r.role === role)?.permissions ?? [];
              return (
                <View key={role} style={{ gap: 2, paddingVertical: espacio.sm }}>
                  <Texto variante="etiqueta">{ROLE_INFO[role].label}</Texto>
                  <Texto variante="pequeno">{ROLE_INFO[role].summary}</Texto>
                  <Texto variante="pequeno" suave>
                    {permissions.map(permissionLabel).join(' · ')}
                  </Texto>
                </View>
              );
            })}
          </CollapsibleCard>
        </View>
      ) : null}

      <Lightbox visible={adding} title="Agregar persona" description="Entrará con este correo y contraseña." onClose={closeDialogs} maxWidth={560}>
        <CampoDeTexto etiqueta="Nombre completo" icono="user" {...field('display_name')} />
        <CampoDeTexto etiqueta="Correo" icono="mail" autoCapitalize="none" autoComplete="off" {...field('email')} />
        <CampoDeTexto etiqueta="Contraseña inicial" icono="lock" secureTextEntry autoComplete="new-password" ayuda="Mínimo 10 caracteres, con mayúsculas, minúsculas, número y símbolo." {...field('password')} />
        <RolePicker value={form.role} onChange={(role) => setForm((f) => ({ ...f, role }))} />
        {failure ? <Aviso texto={failure} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espacio.sm }}>
          <Boton etiqueta="Cancelar" variante="secundario" onPress={closeDialogs} deshabilitado={busy} />
          <Boton etiqueta="Guardar persona" icono="check" onPress={add} cargando={busy} />
        </View>
      </Lightbox>

      <Lightbox visible={editing !== null} title="Cambiar rol" description={editing?.member.email} onClose={closeDialogs} maxWidth={560}>
        {editing ? <RolePicker value={editing.role} onChange={(role) => setEditing({ ...editing, role })} /> : null}
        {failure ? <Aviso texto={failure} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espacio.sm }}>
          <Boton etiqueta="Cancelar" variante="secundario" onPress={closeDialogs} deshabilitado={busy} />
          <Boton
            etiqueta="Guardar rol"
            icono="check"
            cargando={busy}
            onPress={() => editing && void run(() => conSesion(changeMemberApi(editing.member.id, { role: editing.role })), 'Rol actualizado', () => setEditing(null))}
          />
        </View>
      </Lightbox>

      <ConfirmDialog
        visible={toggling !== null}
        title={toggling?.active ? '¿Desactivar esta cuenta?' : '¿Activar esta cuenta?'}
        description={toggling?.active ? `${toggling.email} perderá el acceso de inmediato. Su historial se conserva.` : `${toggling?.email ?? ''} podrá volver a entrar.`}
        confirmLabel={toggling?.active ? 'Sí, desactivar' : 'Sí, activar'}
        confirmIcon="check"
        onCancel={() => setToggling(null)}
        onConfirm={() => {
          const member = toggling;
          setToggling(null);
          if (member) void run(() => conSesion(changeMemberApi(member.id, { active: !member.active })), member.active ? 'Cuenta desactivada' : 'Cuenta activada', () => undefined);
        }}
      />
    </Pagina>
  );
}
