"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", icon: "D" },
  { href: "/slides", label: "Slides", icon: "S" },
  { href: "/classifiers", label: "Classifiers", icon: "C" },
  { href: "/inference", label: "Inference", icon: "I" },
  { href: "/search", label: "Search", icon: "Q" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-tight">PathVision</h1>
        <p className="text-xs text-gray-400 mt-1">Digital Pathology AI</p>
      </div>
      <nav className="flex-1 py-4">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <span className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center text-xs font-mono">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
        Path Foundation v1
      </div>
    </aside>
  );
}
