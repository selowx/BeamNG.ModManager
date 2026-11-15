import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CHANGELOG_RELEASES, type ChangelogChange } from '../data/changelog';
import { cn } from '../utils';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

const CATEGORY_ORDER: ChangelogChange['category'][] = ['Added', 'Improved', 'Fixed'];

const CATEGORY_META: Record<ChangelogChange['category'], { badge: string; bullet: string }> = {
  Added: {
    badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
    bullet: 'bg-emerald-400',
  },
  Improved: {
    badge: 'bg-[#282e3c] text-zinc-200 border-[#3a4254]',
    bullet: 'bg-[#ff6600]',
  },
  Fixed: {
    badge: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
    bullet: 'bg-amber-400',
  },
};

export function ChangelogSection() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [CHANGELOG_RELEASES[0]?.version ?? '']: true,
  }));

  const toggleRelease = (version: string) => {
    setExpanded((prev) => ({ ...prev, [version]: !prev[version] }));
  };

  return (
    <div className="w-full max-w-6xl space-y-3">
      {CHANGELOG_RELEASES.map((release, idx) => {
        const isLatest = idx === 0;
        const isOpen = Boolean(expanded[release.version]);

        return (
          <Card
            key={release.version}
            className={cn(
              'bg-[#222733] border-[#323949] overflow-hidden',
              isLatest && 'border-l-2 border-l-[#ff6600]'
            )}
          >
            <button
              type="button"
              onClick={() => toggleRelease(release.version)}
              aria-expanded={isOpen}
              className="w-full p-4 text-left flex items-start justify-between gap-4 hover:bg-[#262c3a] transition-colors cursor-pointer"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant={isLatest ? 'default' : 'outline'}
                    className={cn(
                      'font-mono tabular-nums text-[11px] px-2',
                      !isLatest && 'bg-[#1c202a] border-[#323949] text-zinc-300'
                    )}
                  >
                    v{release.version}
                  </Badge>
                  {isLatest && (
                    <Badge variant="success" className="text-[11px] uppercase tracking-wider">
                      Latest
                    </Badge>
                  )}
                  <h3 className="text-sm font-bold text-white">{release.title}</h3>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{release.summary}</p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                {!isOpen && (
                  <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                    {release.changes.length} updates
                  </span>
                )}
                <span className="text-xs font-mono tabular-nums text-zinc-400">{release.date}</span>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-3 border-t border-[#323949] space-y-3 bg-[#1e232e]">
                {CATEGORY_ORDER.map((category) => {
                  const items = release.changes.filter((c) => c.category === category);
                  if (items.length === 0) return null;
                  const meta = CATEGORY_META[category];

                  return (
                    <div key={category} className="space-y-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 h-5 text-[11px] font-semibold border rounded-sm leading-none',
                          meta.badge
                        )}
                      >
                        {category}
                      </span>
                      <ul className="space-y-1.5 pl-1">
                        {items.map((item, iIdx) => (
                          <li key={iIdx} className="flex items-start gap-2.5 text-xs text-zinc-300 leading-5">
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]', meta.bullet)} />
                            <span className="min-w-0">{item.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
