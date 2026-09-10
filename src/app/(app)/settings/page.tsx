import Link from "next/link";
import { settingsGroups } from "@/lib/settings";
import { requireActiveContext } from "@/lib/session";
import { Search } from "lucide-react";

function GroupCard({ group }: { group: (typeof settingsGroups)[number] }) {
  const Icon = group.icon;
  const tone =
    group.section === "organization"
      ? "bg-green-50 text-green-600"
      : "bg-amber-50 text-amber-600";
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tone}`}>
          <Icon size={16} />
        </span>
        <h3 className="text-sm font-semibold text-ink-800">{group.label}</h3>
      </div>
      <ul className="space-y-1.5">
        {group.items.map((item) => (
          <li key={item.slug}>
            <Link
              href={`/settings/${group.slug}/${item.slug}`}
              className="block text-sm text-ink-700 hover:text-brand-600 hover:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function SettingsPage() {
  const ctx = await requireActiveContext();
  const orgGroups = settingsGroups.filter((g) => g.section === "organization");
  const moduleGroups = settingsGroups.filter((g) => g.section === "module");

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-800">All Settings</h1>
          <p className="mt-0.5 text-sm text-gray-500">{ctx.orgName}</p>
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input className="input pl-8" placeholder="Search settings ( / )" />
        </div>
      </div>

      <div className="p-6">
        <div className="card mb-6 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink-800">Organization Settings</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {orgGroups.map((g) => (
              <GroupCard key={g.slug} group={g} />
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-ink-800">Module Settings</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {moduleGroups.map((g) => (
              <GroupCard key={g.slug} group={g} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
