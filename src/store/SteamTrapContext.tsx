import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppData,
  EngineeringReviewOutcome,
  EngineeringReviewRecord,
  Equipment,
  IssueType,
  MaintenanceAction,
  MaintenanceRecord,
  PMRecord,
  ShutdownDeferral,
  Trap,
  TrapStatus,
} from '../types';
import { ISSUE_TYPES, DEFAULT_TRAP_DATASHEET } from '../types';
import { seedData } from '../data/seedData';
import { todayISO } from '../utils/logic';
import { upsertTodayKPISnapshot } from '../utils/kpiSnapshots';
import { uid } from '../utils/id';

interface SteamTrapContextValue {
  data: AppData;

  getEquipment: (id: string) => Equipment | undefined;
  getTrap: (id: string) => Trap | undefined;
  trapsForEquipment: (equipmentId: string) => Trap[];

  addEquipment: (e: Omit<Equipment, 'id'>) => Equipment;
  updateEquipment: (id: string, patch: Partial<Omit<Equipment, 'id'>>) => void;
  deleteEquipment: (id: string) => void;

  addTrap: (t: Omit<Trap, 'id'>) => Trap;
  updateTrap: (id: string, patch: Partial<Omit<Trap, 'id'>>) => void;
  deleteTrap: (id: string) => void;

  addPM: (
    trapId: string,
    input: {
      date?: string;
      status: TrapStatus;
      issue_type?: IssueType | null;
      technician?: string;
      notes?: string;
    },
  ) => { ok: true; record: PMRecord } | { ok: false; error: string };

  updatePM: (
    id: string,
    input: {
      date?: string;
      status?: TrapStatus;
      issue_type?: IssueType | null;
      technician?: string;
      notes?: string;
    },
  ) => { ok: true } | { ok: false; error: string };

  deletePM: (id: string) => void;

  addMaintenance: (
    trapId: string,
    input: {
      date?: string;
      action: MaintenanceAction;
      technician?: string;
      description?: string;
      parts_replaced?: string;
      cost?: number | null;
      notes?: string;
    },
  ) => MaintenanceRecord;

  updateMaintenance: (
    id: string,
    input: {
      date?: string;
      action?: MaintenanceAction;
      technician?: string;
      description?: string;
      parts_replaced?: string;
      cost?: number | null;
      notes?: string;
    },
  ) => void;

  deleteMaintenance: (id: string) => void;

  addShutdownDeferral: (
    trapId: string,
    input: {
      recorded_date?: string;
      pm_due_date?: string;
      technician?: string;
      notes?: string;
    },
  ) => ShutdownDeferral;

  updateShutdownDeferral: (
    id: string,
    input: {
      recorded_date?: string;
      pm_due_date?: string;
      technician?: string;
      notes?: string;
    },
  ) => void;

  deleteShutdownDeferral: (id: string) => void;

  addEngineeringReview: (
    trapId: string,
    input: {
      review_date?: string;
      reviewer?: string;
      outcome: EngineeringReviewOutcome;
      replacement_manufacturer?: string;
      replacement_model?: string;
      replacement_notes?: string;
      notes?: string;
    },
  ) => EngineeringReviewRecord;

  updateEngineeringReview: (
    id: string,
    input: {
      review_date?: string;
      reviewer?: string;
      outcome?: EngineeringReviewOutcome;
      replacement_manufacturer?: string;
      replacement_model?: string;
      replacement_notes?: string;
      notes?: string;
    },
  ) => void;

  deleteEngineeringReview: (id: string) => void;

  resetToSeed: () => void;
}

const SteamTrapContext = createContext<SteamTrapContextValue | null>(null);

export function SteamTrapProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => structuredClone(seedData));

  const commitData = useCallback((updater: (d: AppData) => AppData) => {
    setData((d) => upsertTodayKPISnapshot(updater(d)));
  }, []);

  useEffect(() => {
    setData((d) => upsertTodayKPISnapshot(d));
  }, []);

  const getEquipment = useCallback(
    (id: string) => data.equipment.find((e) => e.id === id),
    [data.equipment],
  );
  const getTrap = useCallback((id: string) => data.traps.find((t) => t.id === id), [data.traps]);
  const trapsForEquipment = useCallback(
    (equipmentId: string) => data.traps.filter((t) => t.equipment_id === equipmentId),
    [data.traps],
  );

  const addEquipment = useCallback((e: Omit<Equipment, 'id'>) => {
    const created: Equipment = { ...e, id: uid('eq') };
    commitData((d) => ({ ...d, equipment: [...d.equipment, created] }));
    return created;
  }, [commitData]);

  const updateEquipment = useCallback((id: string, patch: Partial<Omit<Equipment, 'id'>>) => {
    commitData((d) => ({
      ...d,
      equipment: d.equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, [commitData]);

  const deleteEquipment = useCallback((id: string) => {
    commitData((d) => {
      const trapIds = new Set(d.traps.filter((t) => t.equipment_id === id).map((t) => t.id));
      return {
        ...d,
        equipment: d.equipment.filter((e) => e.id !== id),
        traps: d.traps.filter((t) => t.equipment_id !== id),
        pm_records: d.pm_records.filter((r) => !trapIds.has(r.trap_id)),
        maintenance_records: d.maintenance_records.filter((r) => !trapIds.has(r.trap_id)),
        shutdown_deferrals: d.shutdown_deferrals.filter((r) => !trapIds.has(r.trap_id)),
        engineering_reviews: d.engineering_reviews.filter((r) => !trapIds.has(r.trap_id)),
      };
    });
  }, [commitData]);

  const addTrap = useCallback((t: Omit<Trap, 'id'>) => {
    const created: Trap = { ...DEFAULT_TRAP_DATASHEET, ...t, id: uid('tr') };
    commitData((d) => ({ ...d, traps: [...d.traps, created] }));
    return created;
  }, [commitData]);

  const updateTrap = useCallback((id: string, patch: Partial<Omit<Trap, 'id'>>) => {
    commitData((d) => ({
      ...d,
      traps: d.traps.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, [commitData]);

  const deleteTrap = useCallback((id: string) => {
    commitData((d) => ({
      ...d,
      traps: d.traps.filter((t) => t.id !== id),
      pm_records: d.pm_records.filter((r) => r.trap_id !== id),
      maintenance_records: d.maintenance_records.filter((r) => r.trap_id !== id),
      shutdown_deferrals: d.shutdown_deferrals.filter((r) => r.trap_id !== id),
      engineering_reviews: d.engineering_reviews.filter((r) => r.trap_id !== id),
    }));
  }, [commitData]);

  const addPM = useCallback(
    (
      trapId: string,
      input: {
        date?: string;
        status: TrapStatus;
        issue_type?: IssueType | null;
        technician?: string;
        notes?: string;
      },
    ): { ok: true; record: PMRecord } | { ok: false; error: string } => {
      let result: { ok: true; record: PMRecord } | { ok: false; error: string } = {
        ok: false,
        error: 'Trap not found',
      };

      commitData((d) => {
        const trap = d.traps.find((t) => t.id === trapId);
        if (!trap) return d;
        if (input.status === 'Issue') {
          const it = input.issue_type;
          if (!it || !ISSUE_TYPES.includes(it)) {
            result = { ok: false, error: "Issue type is required when status is 'Issue'" };
            return d;
          }
        }

        const record: PMRecord = {
          id: uid('pm'),
          trap_id: trapId,
          date: (input.date ?? '').trim() || todayISO(),
          status: input.status,
          issue_type: input.status === 'Issue' ? (input.issue_type ?? null) : null,
          technician: (input.technician ?? '').trim() || 'Unknown',
          notes: (input.notes ?? '').trim(),
          created_at: new Date().toISOString(),
        };
        result = { ok: true, record };
        return { ...d, pm_records: [...d.pm_records, record] };
      });

      return result;
    },
    [commitData],
  );

  const updatePM = useCallback(
    (
      id: string,
      input: {
        date?: string;
        status?: TrapStatus;
        issue_type?: IssueType | null;
        technician?: string;
        notes?: string;
      },
    ): { ok: true } | { ok: false; error: string } => {
      let result: { ok: true } | { ok: false; error: string } = { ok: true };

      commitData((d) => {
        const existing = d.pm_records.find((r) => r.id === id);
        if (!existing) {
          result = { ok: false, error: 'PM record not found' };
          return d;
        }

        const status = input.status ?? existing.status;
        const issue_type = status === 'Issue' ? (input.issue_type ?? existing.issue_type) : null;

        if (status === 'Issue') {
          const it = issue_type;
          if (!it || !ISSUE_TYPES.includes(it)) {
            result = { ok: false, error: "Issue type is required when status is 'Issue'" };
            return d;
          }
        }

        return {
          ...d,
          pm_records: d.pm_records.map((r) =>
            r.id === id
              ? {
                  ...r,
                  date: (input.date ?? r.date).trim() || r.date,
                  status,
                  issue_type,
                  technician: (input.technician ?? r.technician).trim() || r.technician,
                  notes: (input.notes ?? r.notes).trim(),
                }
              : r,
          ),
        };
      });

      return result;
    },
    [commitData],
  );

  const deletePM = useCallback((id: string) => {
    commitData((d) => ({
      ...d,
      pm_records: d.pm_records.filter((r) => r.id !== id),
    }));
  }, [commitData]);

  const addMaintenance = useCallback(
    (
      trapId: string,
      input: {
        date?: string;
        action: MaintenanceAction;
        technician?: string;
        description?: string;
        parts_replaced?: string;
        cost?: number | null;
        notes?: string;
      },
    ): MaintenanceRecord => {
      const record: MaintenanceRecord = {
        id: uid('mnt'),
        trap_id: trapId,
        date: (input.date ?? '').trim() || todayISO(),
        action: input.action,
        technician: (input.technician ?? '').trim() || 'Unknown',
        description: (input.description ?? '').trim(),
        parts_replaced: (input.parts_replaced ?? '').trim(),
        cost: input.cost ?? null,
        notes: (input.notes ?? '').trim(),
        created_at: new Date().toISOString(),
      };
      commitData((d) => ({
        ...d,
        maintenance_records: [...d.maintenance_records, record],
      }));
      return record;
    },
    [commitData],
  );

  const updateMaintenance = useCallback(
    (
      id: string,
      input: {
        date?: string;
        action?: MaintenanceAction;
        technician?: string;
        description?: string;
        parts_replaced?: string;
        cost?: number | null;
        notes?: string;
      },
    ) => {
      commitData((d) => ({
        ...d,
        maintenance_records: d.maintenance_records.map((r) =>
          r.id === id
            ? {
                ...r,
                date: (input.date ?? r.date).trim() || r.date,
                action: input.action ?? r.action,
                technician: (input.technician ?? r.technician).trim() || r.technician,
                description: (input.description ?? r.description).trim(),
                parts_replaced: (input.parts_replaced ?? r.parts_replaced).trim(),
                cost: input.cost !== undefined ? input.cost : r.cost,
                notes: (input.notes ?? r.notes).trim(),
              }
            : r,
        ),
      }));
    },
    [commitData],
  );

  const deleteMaintenance = useCallback((id: string) => {
    commitData((d) => ({
      ...d,
      maintenance_records: d.maintenance_records.filter((r) => r.id !== id),
    }));
  }, [commitData]);

  const addShutdownDeferral = useCallback(
    (
      trapId: string,
      input: {
        recorded_date?: string;
        pm_due_date?: string;
        technician?: string;
        notes?: string;
      },
    ): ShutdownDeferral => {
      const record: ShutdownDeferral = {
        id: uid('sd'),
        trap_id: trapId,
        recorded_date: (input.recorded_date ?? '').trim() || todayISO(),
        pm_due_date: (input.pm_due_date ?? '').trim() || todayISO(),
        technician: (input.technician ?? '').trim() || 'Unknown',
        notes: (input.notes ?? '').trim(),
        created_at: new Date().toISOString(),
      };
      commitData((d) => ({
        ...d,
        shutdown_deferrals: [...d.shutdown_deferrals, record],
      }));
      return record;
    },
    [commitData],
  );

  const updateShutdownDeferral = useCallback(
    (
      id: string,
      input: {
        recorded_date?: string;
        pm_due_date?: string;
        technician?: string;
        notes?: string;
      },
    ) => {
      commitData((d) => ({
        ...d,
        shutdown_deferrals: d.shutdown_deferrals.map((r) =>
          r.id === id
            ? {
                ...r,
                recorded_date: (input.recorded_date ?? r.recorded_date).trim() || r.recorded_date,
                pm_due_date: (input.pm_due_date ?? r.pm_due_date).trim() || r.pm_due_date,
                technician: (input.technician ?? r.technician).trim() || r.technician,
                notes: (input.notes ?? r.notes).trim(),
              }
            : r,
        ),
      }));
    },
    [commitData],
  );

  const deleteShutdownDeferral = useCallback((id: string) => {
    commitData((d) => ({
      ...d,
      shutdown_deferrals: d.shutdown_deferrals.filter((r) => r.id !== id),
    }));
  }, [commitData]);

  const addEngineeringReview = useCallback(
    (
      trapId: string,
      input: {
        review_date?: string;
        reviewer?: string;
        outcome: EngineeringReviewOutcome;
        replacement_manufacturer?: string;
        replacement_model?: string;
        replacement_notes?: string;
        notes?: string;
      },
    ): EngineeringReviewRecord => {
      const record: EngineeringReviewRecord = {
        id: uid('er'),
        trap_id: trapId,
        review_date: (input.review_date ?? '').trim() || todayISO(),
        reviewer: (input.reviewer ?? '').trim() || 'Unknown',
        outcome: input.outcome,
        replacement_manufacturer: (input.replacement_manufacturer ?? '').trim(),
        replacement_model: (input.replacement_model ?? '').trim(),
        replacement_notes: (input.replacement_notes ?? '').trim(),
        notes: (input.notes ?? '').trim(),
        created_at: new Date().toISOString(),
      };
      commitData((d) => ({
        ...d,
        engineering_reviews: [...d.engineering_reviews, record],
      }));
      return record;
    },
    [commitData],
  );

  const updateEngineeringReview = useCallback(
    (
      id: string,
      input: {
        review_date?: string;
        reviewer?: string;
        outcome?: EngineeringReviewOutcome;
        replacement_manufacturer?: string;
        replacement_model?: string;
        replacement_notes?: string;
        notes?: string;
      },
    ) => {
      commitData((d) => ({
        ...d,
        engineering_reviews: d.engineering_reviews.map((r) => {
          if (r.id !== id) return r;
          const outcome = input.outcome ?? r.outcome;
          const showReplacement = outcome === 'Trap replaced';
          return {
            ...r,
            review_date: (input.review_date ?? r.review_date).trim() || r.review_date,
            reviewer: (input.reviewer ?? r.reviewer).trim() || r.reviewer,
            outcome,
            replacement_manufacturer: showReplacement
              ? (input.replacement_manufacturer ?? r.replacement_manufacturer).trim()
              : '',
            replacement_model: showReplacement
              ? (input.replacement_model ?? r.replacement_model).trim()
              : '',
            replacement_notes: showReplacement
              ? (input.replacement_notes ?? r.replacement_notes).trim()
              : '',
            notes: (input.notes ?? r.notes).trim(),
          };
        }),
      }));
    },
    [commitData],
  );

  const deleteEngineeringReview = useCallback((id: string) => {
    commitData((d) => ({
      ...d,
      engineering_reviews: d.engineering_reviews.filter((r) => r.id !== id),
    }));
  }, [commitData]);

  const resetToSeed = useCallback(() => setData(structuredClone(seedData)), []);

  const value = useMemo<SteamTrapContextValue>(
    () => ({
      data,
      getEquipment,
      getTrap,
      trapsForEquipment,
      addEquipment,
      updateEquipment,
      deleteEquipment,
      addTrap,
      updateTrap,
      deleteTrap,
      addPM,
      updatePM,
      deletePM,
      addMaintenance,
      updateMaintenance,
      deleteMaintenance,
      addShutdownDeferral,
      updateShutdownDeferral,
      deleteShutdownDeferral,
      addEngineeringReview,
      updateEngineeringReview,
      deleteEngineeringReview,
      resetToSeed,
    }),
    [
      data,
      getEquipment,
      getTrap,
      trapsForEquipment,
      addEquipment,
      updateEquipment,
      deleteEquipment,
      addTrap,
      updateTrap,
      deleteTrap,
      addPM,
      updatePM,
      deletePM,
      addMaintenance,
      updateMaintenance,
      deleteMaintenance,
      addShutdownDeferral,
      updateShutdownDeferral,
      deleteShutdownDeferral,
      addEngineeringReview,
      updateEngineeringReview,
      deleteEngineeringReview,
      resetToSeed,
    ],
  );

  return <SteamTrapContext.Provider value={value}>{children}</SteamTrapContext.Provider>;
}

export function useSteamTrap(): SteamTrapContextValue {
  const ctx = useContext(SteamTrapContext);
  if (!ctx) throw new Error('useSteamTrap must be used within a SteamTrapProvider');
  return ctx;
}
