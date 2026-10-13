import { create } from 'zustand';
import { createClient } from '@supabase/supabase-js';
import { MapProject } from '../types/gis';
import { useMapStore } from './useMapStore';

const DEFAULT_ATLAS_SUPABASE_URL = 'https://cyczyaswxkpdcremqnkn.supabase.co';
const DEFAULT_ATLAS_SUPABASE_KEY = 'sb_publishable_pUppHGjwmT1mLlhWGZH6Og_4GcCLCPR';

export type AtlasWorkspaceType = 'standalone' | 'mosaic' | 'mosaic_project';
export interface AtlasWorkspaceScope {
  type: AtlasWorkspaceType;
  mosaicProjectId?: string;
}

const standaloneScope: AtlasWorkspaceScope = { type: 'standalone' };

function createSupabaseClient(scope: AtlasWorkspaceScope) {
  const isEmbedded = scope.type !== 'standalone';
  const url = isEmbedded
    ? process.env.NEXT_PUBLIC_ATLAS_SUPABASE_URL || DEFAULT_ATLAS_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_ATLAS_SUPABASE_URL || DEFAULT_ATLAS_SUPABASE_URL;
  const key = isEmbedded
    ? process.env.NEXT_PUBLIC_ATLAS_SUPABASE_ANON_KEY || DEFAULT_ATLAS_SUPABASE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_ATLAS_SUPABASE_ANON_KEY || DEFAULT_ATLAS_SUPABASE_KEY;
  return createClient(url, key);
}

export let supabase = createSupabaseClient(standaloneScope);

function scopeKey(scope: AtlasWorkspaceScope) {
  return `${scope.type}:${scope.mosaicProjectId || ''}`;
}

function resetMapWorkspace() {
  useMapStore.setState({
    activeTool: null,
    selectedId: null,
    selectedLayerIds: [],
    features: [],
    customGroups: { 'Trade Area Scan': { collapsed: false, ids: [] } },
    currentBasemap: 'Midnight Blue',
    draft: [],
    cursorLL: null,
    contextMenu: { visible: false, x: 0, y: 0, lngLat: null, featureId: null },
    activePanels: {
      browser: false, myLayers: false, search: false, customMap: false, shapeEditor: false,
      tradeArea: false, attributeTable: false, routeSettings: false, markerSettings: false,
      textSettings: false, launcher: false, buildingCatalog: false,
    },
    isDirty: false,
    saveStatus: 'saved',
    undoStack: [],
    redoStack: [],
  });
}

interface ProjectState {
  workspaceScope: AtlasWorkspaceScope;
  projects: MapProject[];
  currentProjectId: string | null;
  currentProjectName: string;
  isLoading: boolean;
  error: string | null;

  setWorkspaceScope: (scope: AtlasWorkspaceScope) => void;
  fetchProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<MapProject | null>;
  loadProject: (project: MapProject) => void;
  saveCurrentProject: (mapInstance?: any) => Promise<boolean>;
  updateProjectName: (id: string, newName: string) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  workspaceScope: standaloneScope,
  projects: [],
  currentProjectId: null,
  currentProjectName: 'Untitled Project 1',
  isLoading: false,
  error: null,

  setWorkspaceScope: (scope) => {
    if (scopeKey(scope) === scopeKey(get().workspaceScope)) return;
    supabase = createSupabaseClient(scope);
    resetMapWorkspace();
    set({
      workspaceScope: scope,
      projects: [],
      currentProjectId: null,
      currentProjectName: 'Untitled Project 1',
      isLoading: true,
      error: null,
    });
  },

  fetchProjects: async () => {
    const scope = get().workspaceScope;
    const requestScopeKey = scopeKey(scope);
    set({ isLoading: true, error: null });
    try {
      const baseQuery = supabase.from('map_projects').select('*');
      const query = scope.type === 'standalone'
        ? baseQuery.eq('workspace_type', 'standalone')
        : scope.type === 'mosaic_project'
          ? baseQuery.eq('workspace_type', 'mosaic_project').eq('mosaic_project_id', scope.mosaicProjectId || '')
          : baseQuery.eq('workspace_type', 'mosaic');
      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;
      if (scopeKey(get().workspaceScope) !== requestScopeKey) return;
      const projects = (data || []) as MapProject[];
      set({ projects, isLoading: false });

      if (!get().currentProjectId && projects.length > 0) {
        get().loadProject(projects[0]);
      }
    } catch (err: any) {
      if (scopeKey(get().workspaceScope) !== requestScopeKey) return;
      console.warn('Failed to fetch projects from Supabase:', err);
      set({ isLoading: false, error: err.message });
    }
  },

  createProject: async (name) => {
    const scope = get().workspaceScope;
    const existingProject = scope.type === 'mosaic_project' ? get().projects[0] : undefined;
    if (existingProject) {
      get().loadProject(existingProject);
      return existingProject;
    }
    const nextName = name || `Untitled Project ${get().projects.length + 1}`;
    const payload = {
      name: nextName,
      workspace_type: scope.type,
      mosaic_project_id: scope.type === 'mosaic_project' ? scope.mosaicProjectId : null,
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
    const { currentProjectId, currentProjectName, workspaceScope } = get();
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
      workspace_type: workspaceScope.type,
      mosaic_project_id: workspaceScope.type === 'mosaic_project' ? workspaceScope.mosaicProjectId : null,
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
      const baseQuery = supabase.from('map_projects').update(payload).eq('id', currentProjectId);
      const query = workspaceScope.type === 'standalone'
        ? baseQuery.eq('workspace_type', 'standalone')
        : workspaceScope.type === 'mosaic_project'
          ? baseQuery.eq('workspace_type', 'mosaic_project').eq('mosaic_project_id', workspaceScope.mosaicProjectId || '')
          : baseQuery.eq('workspace_type', 'mosaic');
      const { error } = await query;

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
    const workspaceScope = get().workspaceScope;
    const nowIso = new Date().toISOString();
    try {
      const baseQuery = supabase.from('map_projects').update({ name: newName, updated_at: nowIso }).eq('id', id);
      const query = workspaceScope.type === 'standalone'
        ? baseQuery.eq('workspace_type', 'standalone')
        : workspaceScope.type === 'mosaic_project'
          ? baseQuery.eq('workspace_type', 'mosaic_project').eq('mosaic_project_id', workspaceScope.mosaicProjectId || '')
          : baseQuery.eq('workspace_type', 'mosaic');
      const { error } = await query;
      if (error) throw error;

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
    const workspaceScope = get().workspaceScope;
    try {
      const baseQuery = supabase.from('map_projects').delete().eq('id', id);
      const query = workspaceScope.type === 'standalone'
        ? baseQuery.eq('workspace_type', 'standalone')
        : workspaceScope.type === 'mosaic_project'
          ? baseQuery.eq('workspace_type', 'mosaic_project').eq('mosaic_project_id', workspaceScope.mosaicProjectId || '')
          : baseQuery.eq('workspace_type', 'mosaic');
      const { error } = await query;
      if (error) throw error;
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
      }));
      return true;
    } catch (err) {
      return false;
    }
  },
}));
