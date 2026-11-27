import { type Href, Redirect } from 'expo-router';

/** Old route kept so existing links keep working: the form now opens as a lightbox over the project list. */
export default function NewProjectRoute() {
  return <Redirect href={'/proyectos?new=1' as Href} />;
}
