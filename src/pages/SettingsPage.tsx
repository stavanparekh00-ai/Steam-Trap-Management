import { useSteamTrap } from '../store/SteamTrapContext';
import { PM_INTERVAL_DAYS } from '../utils/logic';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function SettingsPage() {
  const { resetToSeed } = useSteamTrap();

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Settings' }]} />
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm text-slate-500">
          Application configuration. This is a read-only demo — changes are not saved between visits.
        </p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">PM Schedule</h3>
        <p className="mt-2 text-sm text-slate-600">
          All trap types use a uniform preventive maintenance interval of{' '}
          <span className="font-semibold">{PM_INTERVAL_DAYS} days (3 months)</span>. Next PM is
          calculated from the last inspection date.
        </p>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">Demo Data</h3>
        <p className="mt-2 text-sm text-slate-500">
          Restore the application to its seeded demonstration dataset. Useful if you want to undo
          changes made during your current session.
        </p>
        <button
          className="btn-secondary mt-4 text-red-700"
          onClick={() => {
            if (confirm('Reset all data to the demo dataset?')) resetToSeed();
          }}
        >
          Reset Demo Data
        </button>
      </div>
    </div>
  );
}
