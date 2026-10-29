import { useEffect, useState } from 'react';
import { zonesApi, extractError } from '../../api/recognitionApi';
import ZonesPanel from './ZonesPanel';
import PersonsPanel from './PersonsPanel';
import TestPanel from './TestPanel';
import VideosPanel from './VideosPanel';
import { Banner } from './ui';

const TABS = [
  { id: 'zones', label: 'Zones' },
  { id: 'persons', label: 'Personnes connues' },
  { id: 'test', label: 'Tester la reconnaissance' },
  { id: 'videos', label: 'Vidéos enregistrées' },
];

export default function RecognitionModule() {
  const [tab, setTab] = useState('zones');
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reloadKey, setReloadKey] = useState(0);
  const loadZones = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    zonesApi.list()
      .then((data) => { if (!cancelled) { setZones(data); setError(''); } })
      .catch((err) => { if (!cancelled) setError(extractError(err, 'Impossible de charger les zones.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Zones et reconnaissance faciale</h2>
        <p className="text-sm text-[#4A5568] mt-1">
          Définissez les zones surveillées et les personnes que vos caméras doivent reconnaître.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-[#D8DEE4]">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 cursor-pointer transition ${
              tab === t.id ? 'border-[#00C2CB] text-[#0B1F3A]' : 'border-transparent text-[#4A5568] hover:text-[#0B1F3A]'}`}>
            {t.label}
            {t.id === 'zones' && !loading && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{zones.length}</span>}
          </button>
        ))}
      </div>

      <Banner>{error}</Banner>

      {tab === 'zones' && <ZonesPanel zones={zones} loading={loading} onChanged={loadZones} />}
      {tab === 'persons' && <PersonsPanel zones={zones} onChanged={loadZones} />}
      {tab === 'test' && <TestPanel zones={zones} />}
      {tab === 'videos' && <VideosPanel zones={zones} />}
    </div>
  );
}
