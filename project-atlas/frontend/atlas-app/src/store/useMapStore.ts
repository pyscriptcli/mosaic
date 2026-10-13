import { create } from 'zustand';
import { GISFeature, CustomGroups, LayerVisibilities, FeatureKind, BuildingArchetype, MarkerShape } from '../types/gis';
import { DEFAULT_VISIBILITIES } from '../gis/map';

interface MapState {
  embeddedMode: 'view' | 'edit' | null;
  changeSequence: number;
  setEmbeddedMode: (mode: 'view' | 'edit' | null) => void;
  replaceEmbeddedFeatures: (features: GISFeature[]) => void;
  commitFeatureChanges: () => void;
  activeTool: FeatureKind | 'placeBuilding' | null;
  editMode: boolean;
  editingRoutePoints: boolean;
  selectedId: number | null;
  selectedLayerIds: number[];
  features: GISFeature[];
  customGroups: CustomGroups;
  visibilities: LayerVisibilities;
  currentBasemap: string;
  is3DMode: boolean;
  openNodeDisplayMode: 'pins' | 'heatmap' | 'clusters';
  setOpenNodeDisplayMode: (mode: 'pins' | 'heatmap' | 'clusters') => void;

  // Drawing state
  draft: [number, number][];
  cursorLL: [number, number] | null;

  // Active floating panels/modals
  activePanels: {
    browser: boolean;
    myLayers: boolean;
    search: boolean;
    customMap: boolean;
    shapeEditor: boolean;
    tradeArea: boolean;
    attributeTable: boolean;
    routeSettings: boolean;
    markerSettings: boolean;
    textSettings: boolean;
    launcher: boolean;
    buildingCatalog: boolean;
  };

  // 3D Building Archetype Tool
  selectedBuildingArchetype: BuildingArchetype;
  setSelectedBuildingArchetype: (archetype: BuildingArchetype) => void;

  // Tool configs
  markerShape: MarkerShape;
  markerColor: string;
  markerSize: number;
  markerSizeMode: 'static' | 'dynamic';
  customMarkerKey: string | null;

  textContent: string;
  textSize: number;
  textColor: string;
  textOpacity: number;

  routeMode: 'driving' | 'walking' | 'cycling';
  routeColor: string;

  // Context menu state
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    lngLat: [number, number] | null;
    featureId: number | null;
  };

  // History & dirty flag
  isDirty: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  undoStack: string[];
  redoStack: string[];
  toastMessage: string | null;

  // Cinematic Cluster Focus State
  activeCinematicCluster: any | null;
  setActiveCinematicCluster: (cluster: any | null) => void;
  focusDisplayMode: 'popup' | 'rightPanel';
  setFocusDisplayMode: (mode: 'popup' | 'rightPanel') => void;

  // Visual Excellence & Digital Twin Studio State
  solarTime: number; // 0.0 - 24.0 (decimal hours)
  isSunDialOpen: boolean;
  isSatelliteXRayActive: boolean;
  isDroneOrbiting: boolean;
  droneOrbitSpeed: number;
  isFogEnabled: boolean;
  is3DTerrain: boolean;
  isNightGlowEnabled: boolean;
  isHeightCaliperEnabled: boolean;
  isTiltShiftEnabled: boolean;
  is3DHeatmapBeacons: boolean;
  isSmartHeightFilter: boolean;

  // Autonomous Cinematic Street Tour State
  activeTour: {
    streetName: string;
    waypoints: [number, number][];
    bearings: number[];
    pois: Array<{
      name: string;
      category: string;
      lon: number;
      lat: number;
      highlight?: string;
    }>;
    currentPoiIndex: number;
    isPlaying: boolean;
    speed: number;
  } | null;

  setSolarTime: (solarTime: number) => void;
  toggleSunDial: (open?: boolean) => void;
  toggleSatelliteXRay: (active?: boolean) => void;
  setDroneOrbiting: (isDroneOrbiting: boolean) => void;
  setDroneOrbitSpeed: (speed: number) => void;
  toggleFog: (enabled?: boolean) => void;
  toggleTerrain: (enabled?: boolean) => void;
  toggleNightGlow: (enabled?: boolean) => void;
  toggleHeightCaliper: (enabled?: boolean) => void;
  toggleTiltShift: (enabled?: boolean) => void;
  toggle3DHeatmapBeacons: (enabled?: boolean) => void;
  toggleSmartHeightFilter: (enabled?: boolean) => void;

  setActiveTour: (tour: MapState['activeTour']) => void;
  setTourPoiIndex: (index: number) => void;
  setTourPlaying: (playing: boolean) => void;

  // Actions
  setActiveTool: (tool: FeatureKind | 'placeBuilding' | null) => void;
  setEditMode: (mode: boolean, selectedId?: number | null) => void;
  setEditingRoutePoints: (editing: boolean) => void;
  setSelectedId: (id: number | null) => void;
  toggleLayerSelection: (id: number) => void;
  selectAllLayers: () => void;
  clearLayerSelection: () => void;
  setFeatures: (features: GISFeature[], recordHistory?: boolean) => void;
  addFeature: (f: GISFeature) => void;
  updateFeature: (id: number, updater: (f: GISFeature) => GISFeature, committed?: boolean) => void;
  removeFeature: (id: number) => void;
  setCustomGroups: (groups: CustomGroups, recordHistory?: boolean) => void;
  setVisibility: (key: string, visible: boolean) => void;
  setBasemap: (name: string) => void;
  set3DMode: (is3D: boolean) => void;

  setDraft: (draft: [number, number][]) => void;
  setCursorLL: (ll: [number, number] | null) => void;

  togglePanel: (panel: keyof MapState['activePanels'], forceState?: boolean) => void;
  closeAllPanels: () => void;

  setContextMenu: (menu: MapState['contextMenu']) => void;
  closeContextMenu: () => void;

  setToolConfig: (config: Partial<{
    markerShape: MapState['markerShape'];
    markerColor: string;
    markerSize: number;
    markerSizeMode: MapState['markerSizeMode'];
    customMarkerKey: string | null;
    textContent: string;
    textSize: number;
    textColor: string;
    textOpacity: number;
    routeMode: MapState['routeMode'];
    routeColor: string;
  }>) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void;
  setToast: (msg: string | null) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  embeddedMode: null,
  changeSequence: 0,
  setEmbeddedMode: (embeddedMode) => set({ embeddedMode, activeTool: null, editMode: false, editingRoutePoints: false, draft: [], selectedId: null }),
  replaceEmbeddedFeatures: (features) => set({ features, selectedId: null, selectedLayerIds: [], activeTool: null, editMode: false, editingRoutePoints: false, draft: [], cursorLL: null, undoStack: [], redoStack: [], isDirty: false, saveStatus: 'saved' }),
  commitFeatureChanges: () => set((state) => state.embeddedMode === 'edit' ? { changeSequence: state.changeSequence + 1 } : {}),
  activeTool: null,
  editMode: false,
  editingRoutePoints: false,
  selectedId: null,
  selectedLayerIds: [],
  features: [],
  customGroups: { "Trade Area Scan": { collapsed: false, ids: [] } },
  visibilities: DEFAULT_VISIBILITIES,
  currentBasemap: "Midnight Blue",
  is3DMode: true,
  openNodeDisplayMode: 'pins',
  setOpenNodeDisplayMode: (openNodeDisplayMode) => set({ openNodeDisplayMode }),

  draft: [],
  cursorLL: null,

  activePanels: {
    browser: false,
    myLayers: false,
    search: false,
    customMap: false,
    shapeEditor: false,
    tradeArea: false,
    attributeTable: false,
    routeSettings: false,
    markerSettings: false,
    textSettings: false,
    launcher: false,
    buildingCatalog: false,
  },

  selectedBuildingArchetype: 'skyscraper',
  setSelectedBuildingArchetype: (archetype) => set({ selectedBuildingArchetype: archetype }),

  markerShape: 'pin',
  markerColor: '#1e40af',
  markerSize: 0.9,
  markerSizeMode: 'static',
  customMarkerKey: null,

  textContent: 'Custom Label',
  textSize: 16,
  textColor: '#d9b451',
  textOpacity: 1,

  routeMode: 'driving',
  routeColor: '#38bdf8',

  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
    lngLat: null,
    featureId: null,
  },

  isDirty: false,
  saveStatus: 'saved',
  undoStack: [],
  redoStack: [],
  toastMessage: null,

  activeCinematicCluster: null,
  setActiveCinematicCluster: (activeCinematicCluster) =>
    set((state) => ({
      activeCinematicCluster,
      ...(activeCinematicCluster
        ? {
            activePanels: {
              ...state.activePanels,
              customMap: false,
              shapeEditor: false,
            },
          }
        : {}),
    })),
  focusDisplayMode: 'popup',
  setFocusDisplayMode: (focusDisplayMode) => set({ focusDisplayMode }),

  // Visual Excellence & Digital Twin Studio State
  solarTime: 12.0, // Default to High Noon
  isSunDialOpen: false,
  isSatelliteXRayActive: false,
  isDroneOrbiting: false,
  droneOrbitSpeed: 1,
  isFogEnabled: true,
  is3DTerrain: true,

  setSolarTime: (solarTime) => set({ solarTime: Math.max(0, Math.min(24, solarTime)) }),
  toggleSunDial: (open) =>
    set((state) => {
      const nextOpen = open !== undefined ? open : !state.isSunDialOpen;
      return {
        isSunDialOpen: nextOpen,
        ...(nextOpen
          ? {
              activePanels: {
                ...state.activePanels,
                search: false,
                customMap: false,
                shapeEditor: false,
              },
            }
          : {}),
      };
    }),
  toggleSatelliteXRay: (active) =>
    set((state) => ({
      isSatelliteXRayActive: active !== undefined ? active : !state.isSatelliteXRayActive,
    })),
  setDroneOrbiting: (isDroneOrbiting) => set({ isDroneOrbiting }),
  setDroneOrbitSpeed: (droneOrbitSpeed) => set({ droneOrbitSpeed }),
  toggleFog: (enabled) =>
    set((state) => ({ isFogEnabled: enabled !== undefined ? enabled : !state.isFogEnabled })),
  toggleTerrain: (enabled) =>
    set((state) => ({ is3DTerrain: enabled !== undefined ? enabled : !state.is3DTerrain })),
  isNightGlowEnabled: false,
  isHeightCaliperEnabled: false,
  isTiltShiftEnabled: false,
  is3DHeatmapBeacons: false,
  isSmartHeightFilter: true,

  toggleNightGlow: (enabled) =>
    set((s) => ({ isNightGlowEnabled: enabled !== undefined ? enabled : !s.isNightGlowEnabled })),
  toggleHeightCaliper: (enabled) =>
    set((s) => ({ isHeightCaliperEnabled: enabled !== undefined ? enabled : !s.isHeightCaliperEnabled })),
  toggleTiltShift: (enabled) =>
    set((s) => ({ isTiltShiftEnabled: enabled !== undefined ? enabled : !s.isTiltShiftEnabled })),
  toggle3DHeatmapBeacons: (enabled) =>
    set((s) => ({ is3DHeatmapBeacons: enabled !== undefined ? enabled : !s.is3DHeatmapBeacons })),
  toggleSmartHeightFilter: (enabled) =>
    set((s) => ({ isSmartHeightFilter: enabled !== undefined ? enabled : !s.isSmartHeightFilter })),

  activeTour: null,

  setActiveTour: (activeTour) => set({ activeTour }),
  setTourPoiIndex: (currentPoiIndex) =>
    set((state) => (state.activeTour ? { activeTour: { ...state.activeTour, currentPoiIndex } } : {})),
  setTourPlaying: (isPlaying) =>
    set((state) => (state.activeTour ? { activeTour: { ...state.activeTour, isPlaying } } : {})),
  setActiveTool: (tool) => {
    set((state) => {
      if (state.embeddedMode === 'view') return { activeTool: null, editMode: false, editingRoutePoints: false, draft: [] };
      const isSame = state.activeTool === tool;
      const nextTool = isSame ? null : tool;
      return {
        activeTool: nextTool,
        editMode: false,
        editingRoutePoints: false,
        draft: [],
        activePanels: {
          ...state.activePanels,
          markerSettings: nextTool === 'marker',
          textSettings: nextTool === 'textbox',
          routeSettings: nextTool === 'route',
          shapeEditor: false,
          customMap: false,
        },
      };
    });
  },

  setEditMode: (editMode, selectedId = null) => {
    set((state) => ({
      editMode: state.embeddedMode === 'view' ? false : editMode,
      editingRoutePoints: false,
      selectedId: selectedId !== undefined ? selectedId : state.selectedId,
      activeTool: state.embeddedMode === 'view' || editMode ? null : state.activeTool,
    }));
  },

  setEditingRoutePoints: (editingRoutePoints) => set((state) => ({ editingRoutePoints: state.embeddedMode === 'view' ? false : editingRoutePoints })),

  setSelectedId: (selectedId) =>
    set((state) => ({
      selectedId,
      ...(selectedId !== state.selectedId ? { editingRoutePoints: false } : {}),
      ...(selectedId !== null && state.activePanels.search
        ? { activePanels: { ...state.activePanels, search: false } }
        : {}),
    })),

  toggleLayerSelection: (id) =>
    set((state) => {
      const exists = state.selectedLayerIds.includes(id);
      return {
        selectedLayerIds: exists
          ? state.selectedLayerIds.filter((x) => x !== id)
          : [...state.selectedLayerIds, id],
      };
    }),

  selectAllLayers: () =>
    set((state) => {
      const openNodeIds = new Set(state.customGroups['Trade Area Scan']?.ids || []);
      const selectableFeatures = state.features.filter((feature) => feature.props.managedBy !== 'open-node' && !openNodeIds.has(feature.id));
      const allSelected = state.selectedLayerIds.length === selectableFeatures.length;
      return {
        selectedLayerIds: allSelected ? [] : selectableFeatures.map((f) => f.id),
      };
    }),

  clearLayerSelection: () => set({ selectedLayerIds: [] }),

  setFeatures: (features, recordHistory = true) => {
    if (get().embeddedMode === 'view') return;
    if (recordHistory) get().pushHistory();
    set((state) => ({ features, isDirty: true, saveStatus: 'unsaved', changeSequence: state.embeddedMode === 'edit' ? state.changeSequence + 1 : state.changeSequence }));
  },

  addFeature: (f) => {
    if (get().embeddedMode === 'view') return;
    get().pushHistory();
    set((state) => ({
      features: [...state.features, f],
      isDirty: true,
      saveStatus: 'unsaved',
      changeSequence: state.embeddedMode === 'edit' ? state.changeSequence + 1 : state.changeSequence,
    }));
  },

  updateFeature: (id, updater, committed = true) => {
    if (get().embeddedMode === 'view') return;
    set((state) => ({
      features: state.features.map((f) => (f.id === id ? updater(f) : f)),
      isDirty: true,
      saveStatus: 'unsaved',
      changeSequence: committed && state.embeddedMode === 'edit' ? state.changeSequence + 1 : state.changeSequence,
    }));
  },

  removeFeature: (id) => {
    if (get().embeddedMode === 'view') return;
    get().pushHistory();
    set((state) => {
      const nextGroups: CustomGroups = {};
      for (const g in state.customGroups) {
        nextGroups[g] = {
          ...state.customGroups[g],
          ids: state.customGroups[g].ids.filter((xId) => xId !== id),
        };
      }
      return {
        features: state.features.filter((f) => f.id !== id),
        customGroups: nextGroups,
        selectedLayerIds: state.selectedLayerIds.filter((xId) => xId !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        isDirty: true,
        saveStatus: 'unsaved',
        changeSequence: state.embeddedMode === 'edit' ? state.changeSequence + 1 : state.changeSequence,
      };
    });
  },

  setCustomGroups: (customGroups, recordHistory = true) => {
    if (get().embeddedMode === 'view') return;
    if (recordHistory) get().pushHistory();
    set((state) => ({ customGroups, isDirty: true, saveStatus: 'unsaved', changeSequence: state.embeddedMode === 'edit' ? state.changeSequence + 1 : state.changeSequence }));
  },

  setVisibility: (key, visible) =>
    set((state) => ({
      visibilities: { ...state.visibilities, [key]: visible },
      isDirty: true,
      saveStatus: 'unsaved',
    })),

  setBasemap: (currentBasemap) => {
    const resolved = (currentBasemap === 'Satellite' || currentBasemap === 'Satellite 3D X-Ray')
      ? 'Google Satellite'
      : currentBasemap;
    set({ currentBasemap: resolved, isDirty: true, saveStatus: 'unsaved' });
  },

  set3DMode: (is3DMode) =>
    set((state) => ({
      is3DMode,
      visibilities: {
        ...state.visibilities,
        building2d: !is3DMode,
        building3d: is3DMode,
      },
      isDirty: true,
      saveStatus: 'unsaved',
    })),

  setDraft: (draft) => set({ draft }),
  setCursorLL: (cursorLL) => set({ cursorLL }),

  togglePanel: (panel, forceState) =>
    set((state) => {
      const currentState = state.activePanels[panel];
      const nextState = forceState !== undefined ? forceState : !currentState;

      // Closing panel
      if (!nextState) {
        return {
          activePanels: {
            ...state.activePanels,
            [panel]: false,
          },
          ...(panel === 'shapeEditor' ? { editMode: false } : {}),
          ...(panel === 'shapeEditor' ? { editingRoutePoints: false } : {}),
        };
      }

      // Opening panel (nextState === true):
      const isMobileOrTablet = typeof window !== 'undefined' && window.innerWidth < 1024;

      const rightPanels: Array<keyof MapState['activePanels']> = ['customMap', 'shapeEditor'];
      const leftPanels: Array<keyof MapState['activePanels']> = ['browser', 'myLayers', 'tradeArea'];
      const centerPanels: Array<keyof MapState['activePanels']> = ['search'];
      const fullscreenModals: Array<keyof MapState['activePanels']> = ['attributeTable', 'buildingCatalog', 'launcher'];

      const updatedPanels = {
        ...state.activePanels,
        [panel]: true,
      };

      // Opening another panel collapses the expanded map search control.
      if (panel !== 'search') updatedPanels.search = false;

      let nextIsSunDialOpen = state.isSunDialOpen;
      let nextActiveCinematicCluster = state.activeCinematicCluster;

      if (fullscreenModals.includes(panel)) {
        // Fullscreen modals supersede all floating panels & drawers
        (Object.keys(updatedPanels) as Array<keyof MapState['activePanels']>).forEach((k) => {
          if (k !== panel) updatedPanels[k] = false;
        });
        nextIsSunDialOpen = false;
        nextActiveCinematicCluster = null;
      } else if (isMobileOrTablet) {
        // On small viewports, close any other open panel to eliminate overlap completely
        (Object.keys(updatedPanels) as Array<keyof MapState['activePanels']>).forEach((k) => {
          if (k !== panel) updatedPanels[k] = false;
        });
        nextIsSunDialOpen = false;
        nextActiveCinematicCluster = null;
      } else {
        // Desktop slot-based mutual exclusion
        if (rightPanels.includes(panel)) {
          // Close other right-docked panels and conflicting overlays
          rightPanels.forEach((p) => {
            if (p !== panel) updatedPanels[p] = false;
          });
          updatedPanels.search = false;
          nextActiveCinematicCluster = null;
        }

        if (leftPanels.includes(panel)) {
          // Close other left-docked panels
          leftPanels.forEach((p) => {
            if (p !== panel) updatedPanels[p] = false;
          });
          if (panel === 'tradeArea') {
            updatedPanels.shapeEditor = false;
          }
        }

        if (centerPanels.includes(panel)) {
          // Close center & right panels
          nextIsSunDialOpen = false;
          updatedPanels.customMap = false;
          updatedPanels.shapeEditor = false;
        }
      }

      return {
        activePanels: updatedPanels,
        isSunDialOpen: nextIsSunDialOpen,
        activeCinematicCluster: nextActiveCinematicCluster,
        ...(panel === 'customMap' ? { editMode: false } : {}),
      };
    }),

  closeAllPanels: () =>
    set(() => ({
      activePanels: {
        browser: false,
        myLayers: false,
        search: false,
        customMap: false,
        shapeEditor: false,
        tradeArea: false,
        attributeTable: false,
        routeSettings: false,
        markerSettings: false,
        textSettings: false,
        launcher: false,
        buildingCatalog: false,
      },
      isSunDialOpen: false,
      activeCinematicCluster: null,
      editMode: false,
      editingRoutePoints: false,
    })),

  setContextMenu: (contextMenu) =>
    set((state) => ({
      contextMenu,
      ...(contextMenu.visible && state.activePanels.search
        ? { activePanels: { ...state.activePanels, search: false } }
        : {}),
    })),
  closeContextMenu: () =>
    set((state) => ({
      contextMenu: { ...state.contextMenu, visible: false },
    })),

  setToolConfig: (config) => set((state) => ({ ...state, ...config })),

  pushHistory: () => {
    const { features, customGroups, undoStack } = get();
    const snapshot = JSON.stringify({ features, customGroups });
    const nextStack = [...undoStack, snapshot];
    if (nextStack.length > 50) nextStack.shift();
    set({ undoStack: nextStack, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack, features, customGroups } = get();
    if (get().embeddedMode === 'view') return;
    if (!undoStack.length) {
      get().setToast('Nothing to undo');
      return;
    }
    const current = JSON.stringify({ features, customGroups });
    const prevStr = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);
    const parsed = JSON.parse(prevStr);

    set({
      features: parsed.features,
      customGroups: parsed.customGroups,
      undoStack: newUndo,
      redoStack: [...redoStack, current],
      isDirty: true,
      saveStatus: 'unsaved',
      changeSequence: get().embeddedMode === 'edit' ? get().changeSequence + 1 : get().changeSequence,
    });
    get().setToast('Undo');
  },

  redo: () => {
    const { undoStack, redoStack, features, customGroups } = get();
    if (get().embeddedMode === 'view') return;
    if (!redoStack.length) {
      get().setToast('Nothing to redo');
      return;
    }
    const current = JSON.stringify({ features, customGroups });
    const nextStr = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);
    const parsed = JSON.parse(nextStr);

    set({
      features: parsed.features,
      customGroups: parsed.customGroups,
      undoStack: [...undoStack, current],
      redoStack: newRedo,
      isDirty: true,
      saveStatus: 'unsaved',
      changeSequence: get().embeddedMode === 'edit' ? get().changeSequence + 1 : get().changeSequence,
    });
    get().setToast('Redo');
  },

  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setToast: (toastMessage) => set({ toastMessage }),
}));
