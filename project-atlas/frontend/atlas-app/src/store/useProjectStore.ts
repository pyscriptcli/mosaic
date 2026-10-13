import { create } from 'zustand';
import { createClient } from '@supabase/supabase-js';
import { MapProject } from '../types/gis';
import { useMapStore } from './useMapStore';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cyczyaswxkpdcremqnkn.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_pUppHGjwmT1mLlhWGZH6Og_4GcCLCPR';

export const supabase = createClient(supabaseUrl, supabaseKey);

interface ProjectState {
  projects: MapProject[];
  currentProjectId: string | null;
  currentProjectName: string;
  isLoading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<MapProject | null>;
  loadProject: (project: MapProject) => void;
  saveCurrentProject: (mapInstance?: any) => Promise<boolean>;
  updateProjectName: (id: string, newName: string) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  currentProjectName: 'Untitled Project 1',
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('map_projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const projects = (data || []) as MapProject[];
      set({ projects, isLoading: false });

      if (!get().currentProjectId && projects.length > 0) {
        get().loadProject(projects[0]);
      }
    } catch (err: any) {
      console.warn('Failed to fetch projects from Supabase:', err);
      set({ isLoading: false, error: err.message });
    }
  },

  createProject: async (name) => {
    const nextName = name || `Untitled Project ${get().projects.length + 1}`;
    const payload = {
      name: nextName,
      basemap: 'Midnight Blue',
      center: [120.9842, 14.5995] as [number, number],
      zoom: 14,
      pitch: 60,
      bearing: -15,
      features: [],
      custom_groups: { "Trade Area Scan": { collapsed: false, ids: [] } },
      layer_visibilities: useMapStore.getState().visibilities,
    };

    try {
      const { data, error } = await supabase
        .from('map_projects')
        .insert([payload])
        .select();

      if (error) throw error;
      const created = (data && data[0]) as MapProject;
      if (created) {
        set((state) => ({
          projects: [created, ...state.projects],
          currentProjectId: created.id,
          currentProjectName: created.name,
        }));
        get().loadProject(created);
        return created;
      }
    } catch (err: any) {
      console.warn('Fallback to local temporary workspace:', err);
      const localProj: MapProject = {
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      };
      set((state) => ({
        projects: [localProj, ...state.projects],
        currentProjectId: localProj.id,
        currentProjectName: localProj.name,
      }));
      get().loadProject(localProj);
      return localProj;
    }
    return null;
  },

  loadProject: (p: MapProject) => {
    set({
      currentProjectId: p.id,
      currentProjectName: p.name,
    });

    const mapStore = useMapStore.getState();
    mapStore.setFeatures(p.features || [], false);
    mapStore.setCustomGroups(
      p.custom_groups || { "Trade Area Scan": { collapsed: false, ids: [] } },
      false
    );
    if (p.basemap) mapStore.setBasemap(p.basemap);
    if (p.layer_visibilities) {
      for (const k in p.layer_visibilities) {
        mapStore.setVisibility(k, p.layer_visibilities[k]);
      }
    }
    mapStore.setSaveStatus('saved');
  },

  saveCurrentProject: async (mapInstance?: any) => {
    const { currentProjectId, currentProjectName } = get();
    if (!currentProjectId || currentProjectId.startsWith('local-')) {
      useMapStore.getState().setToast('Local project (not cloud synced)');
      return false;
    }

    useMapStore.getState().setSaveStatus('saving');
    const mapStore = useMapStore.getState();

    let center: [number, number] = [120.9842, 14.5995];
    let zoom = 14;
    let pitch = 60;
    let bearing = -15;

    if (mapInstance) {
      const c = mapInstance.getCenter();
      center = [c.lng, c.lat];
      zoom = mapInstance.getZoom();
      pitch = mapInstance.getPitch();
      bearing = mapInstance.getBearing();
    }

    const nowIso = new Date().toISOString();
    const payload = {
      name: currentProjectName,
      updated_at: nowIso,
      center,
      zoom,
      pitch,
      bearing,
      basemap: mapStore.currentBasemap,
      features: mapStore.features,
      custom_groups: mapStore.customGroups,
      layer_visibilities: mapStore.visibilities,
    };

    try {
      const { error } = await supabase
        .from('map_projects')
        .update(payload)
        .eq('id', currentProjectId);

      if (error) throw error;

      useMapStore.getState().setSaveStatus('saved');
      useMapStore.getState().setToast('Project Saved!');

      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === currentProjectId ? { ...p, ...payload } : p
        ),
      }));
      return true;
    } catch (err) {
      console.error('Failed to save project:', err);
      useMapStore.getState().setSaveStatus('unsaved');
      useMapStore.getState().setToast('Save failed');
      return false;
    }
  },

  updateProjectName: async (id: string, newName: string) => {
    const nowIso = new Date().toISOString();
    try {
      await supabase
        .from('map_projects')
        .update({ name: newName, updated_at: nowIso })
        .eq('id', id);

      set((state) => ({
        currentProjectName: state.currentProjectId === id ? newName : state.currentProjectName,
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, name: newName, updated_at: nowIso } : p
        ),
      }));
      return true;
    } catch (err) {
      return false;
    }
  },

  deleteProject: async (id: string) => {
    try {
      await supabase.from('map_projects').delete().eq('id', id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
      }));
      return true;
    } catch (err) {
      return false;
    }
  },
}));
