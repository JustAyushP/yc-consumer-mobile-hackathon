import { Tabs } from "expo-router";
import { Icon } from "@/components/companion";
import { colors, fonts } from "@/components/ui/theme";
import { useViewerToken } from "@/components/viewer";

export default function TabLayout() {
  const { token } = useViewerToken();
  return <Tabs key={token ?? "no-viewer"} screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.amber,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
    tabBarLabelStyle: { fontFamily: fonts.body, fontSize: 11 },
    tabBarItemStyle: { paddingTop: 7, paddingBottom: 4 },
    sceneStyle: { backgroundColor: colors.bg },
  }}>
    <Tabs.Screen name="(world)" options={{ title: "World", tabBarIcon: ({ focused }) => <Icon name="world" color={focused ? colors.amber : colors.muted} /> }} />
    <Tabs.Screen name="(investigation)" options={{ title: "Investigation", tabBarIcon: ({ focused }) => <Icon name="investigation" color={focused ? colors.amber : colors.muted} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ focused }) => <Icon name="profile" color={focused ? colors.amber : colors.muted} /> }} />
  </Tabs>;
}
