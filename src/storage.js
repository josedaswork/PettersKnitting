import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage helpers (inlined for standalone builds)
async function loadJSON(key) {
  const data = await AsyncStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}
async function saveJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
async function removeItem(key) {
  await AsyncStorage.removeItem(key);
}

const KEYS = {
  PROJECTS: '@peters_knitting_projects',
  PDF_PREFIX: '@peters_knitting_pdf_',
};

// --- Projects ---

export async function getProjects() {
  return (await loadJSON(KEYS.PROJECTS)) || {};
}

export async function saveProjects(projects) {
  await saveJSON(KEYS.PROJECTS, projects);
}

export async function createProject(name) {
  const projects = await getProjects();
  const id = 'p_' + Date.now();
  projects[id] = {
    name,
    annotations: [],
    counters: [],
    page: 1,
    zoom: 1.3,
    created: Date.now(),
    pdfUri: null,
  };
  await saveProjects(projects);
  return { id, projects };
}

export async function deleteProject(id) {
  const projects = await getProjects();
  delete projects[id];
  await removeItem(KEYS.PDF_PREFIX + id);
  await saveProjects(projects);
  return projects;
}

export async function updateProject(id, updates) {
  const projects = await getProjects();
  if (projects[id]) {
    projects[id] = { ...projects[id], ...updates };
    await saveProjects(projects);
  }
  return projects;
}

// --- PDF Storage ---

export async function savePdfData(projectId, base64Data) {
  await saveJSON(KEYS.PDF_PREFIX + projectId, base64Data);
}

export async function getPdfData(projectId) {
  return await loadJSON(KEYS.PDF_PREFIX + projectId);
}

// --- Counters ---

export async function getCounters(projectId) {
  const projects = await getProjects();
  return projects[projectId]?.counters || [];
}

export async function saveCounters(projectId, counters) {
  await updateProject(projectId, { counters });
}

// --- Annotations ---

export async function getAnnotations(projectId) {
  const projects = await getProjects();
  return projects[projectId]?.annotations || [];
}

export async function saveAnnotations(projectId, annotations) {
  await updateProject(projectId, { annotations });
}
