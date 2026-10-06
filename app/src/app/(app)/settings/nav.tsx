import { Tabs } from "@/components/ui";

export function SettingsNav({ current }: { current: string }) {
  return (
    <Tabs
      items={[
        { key: "hotel", label: "Hotel", href: "/settings" },
        { key: "outlets", label: "Outlets & stations", href: "/settings/outlets" },
        { key: "staffing", label: "Staffing", href: "/settings/staffing" },
        { key: "team", label: "Team", href: "/settings/team" },
        { key: "import", label: "Imports", href: "/settings/import" },
        { key: "engine", label: "Engine", href: "/settings/engine" },
      ]}
      current={current}
    />
  );
}
