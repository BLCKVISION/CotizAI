import { type Href, Redirect } from 'expo-router';

/** Old route kept so existing links keep working. */
export default function LegacySummaryRedirect() {
  return <Redirect href={'/home' as Href} />;
}
