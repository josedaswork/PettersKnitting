import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getProjects,
  saveAnnotations,
  saveCounters,
} from '../storage';
import { COLORS, HIGHLIGHT_SOLID } from '../theme';
import getPdfViewerHtml from '../pdfViewerHtml';

const isWeb = Platform.OS === 'web';

// Conditionally import native-only modules
let WebView, DocumentPicker, FileSystem, SAF;
if (!isWeb) {
  WebView = require('react-native-webview').WebView;
  DocumentPicker = require('expo-document-picker');
  const fs = require('expo-file-system/legacy');
  FileSystem = fs;
  SAF = fs.StorageAccessFramework;
}

// Native PDF storage using file system (avoids AsyncStorage ~6MB limit)
const pdfFilePath = (projectId) =>
  !isWeb ? FileSystem.documentDirectory + `pdf_${projectId}.b64` : null;

async function savePdfToFS(projectId, base64) {
  if (isWeb) {
    const { savePdfData } = require('../storage');
    await savePdfData(projectId, base64);
    return;
  }
  await FileSystem.writeAsStringAsync(pdfFilePath(projectId), base64);
}

async function loadPdfFromFS(projectId) {
  if (isWeb) {
    const { getPdfData } = require('../storage');
    return await getPdfData(projectId);
  }
  const path = pdfFilePath(projectId);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  return await FileSystem.readAsStringAsync(path);
}

async function deletePdfFromFS(projectId) {
  if (isWeb) return;
  const path = pdfFilePath(projectId);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) await FileSystem.deleteAsync(path);
}

const TOOL_COLORS = ['yellow', 'pink', 'green', 'blue'];

export default function PatternScreen({ activeProjectId, onRefresh }) {
  // PDF state
  const [hasPdf, setHasPdf] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [activeColor, setActiveColor] = useState('yellow');
  const [pageInfo, setPageInfo] = useState({ page: 0, total: 0 });
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingNotePos, setPendingNotePos] = useState(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const webviewRef = useRef(null);
  const pendingPdfBase64 = useRef(null);

  // Counter state
  const [counters, setCounters] = useState([]);
  const [countersOpen, setCountersOpen] = useState(false);
  const [addCounterModal, setAddCounterModal] = useState(false);
  const [newCounterName, setNewCounterName] = useState('');
  const [newCounterMax, setNewCounterMax] = useState('');
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkSourceIdx, setLinkSourceIdx] = useState(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameIdx, setRenameIdx] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [editMaxModalVisible, setEditMaxModalVisible] = useState(false);
  const [editMaxIdx, setEditMaxIdx] = useState(null);
  const [editMaxText, setEditMaxText] = useState('');
  const flashAnims = useRef({}).current;

  // Ref to always hold the latest processMessage (avoids stale closures)
  const processMessageRef = useRef(null);

  // ====== WebView Communication ======
  const sendToWebView = useCallback((type, data) => {
    const msg = JSON.stringify({ type, data });
    if (isWeb) {
      const iframe = webviewRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(msg, '*');
      }
    } else {
      if (webviewRef.current) {
        const js = `window.handleRNMessage(${msg}); true;`;
        webviewRef.current.injectJavaScript(js);
      }
    }
  }, []);

  // Listen for postMessage from iframe on web — uses ref to avoid stale closures
  useEffect(() => {
    if (!isWeb) return;
    const handler = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg && msg.type && processMessageRef.current) {
          processMessageRef.current(msg);
        }
      } catch (e) { /* ignore non-JSON messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ====== Load Data ======
  const loadData = async () => {
    if (!activeProjectId) return;
    const projects = await getProjects();
    const p = projects[activeProjectId];
    if (!p) return;
    setCounters(p.counters || []);
    const base64 = await loadPdfFromFS(activeProjectId);
    if (base64) {
      setHasPdf(true);
      pendingPdfBase64.current = base64;
    } else {
      setHasPdf(false);
      pendingPdfBase64.current = null;
    }
  };

  useFocusEffect(
    useCallback(() => {
      setWebviewReady(false);
      loadData();
    }, [activeProjectId])
  );

  // When webview signals ready, send the PDF
  const onWebViewReady = async () => {
    setWebviewReady(true);
    if (!activeProjectId) return;
    const base64 = pendingPdfBase64.current || (await loadPdfFromFS(activeProjectId));
    const projects = await getProjects();
    const annotations = projects[activeProjectId]?.annotations || [];
    if (base64) {
      setTimeout(() => {
        sendToWebView('loadPdf', base64);
        setTimeout(() => sendToWebView('setAnnotations', annotations), 200);
      }, 100);
    }
  };

  // Read file to base64 — works on both web and native
  const readFileAsBase64 = (fileOrUri) => {
    if (isWeb) {
      // On web, fileOrUri is a File object from input
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // result is "data:application/pdf;base64,XXXX"
          const b64 = reader.result.split(',')[1];
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileOrUri);
      });
    } else {
      return FileSystem.readAsStringAsync(fileOrUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  };

  const handlePickPdf = async () => {
    if (isWeb) {
      // Create a file input programmatically (avoids JSX/RN-Web issues)
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async () => {
        const file = input.files[0];
        document.body.removeChild(input);
        if (!file) return;
        try {
          const base64 = await readFileAsBase64(file);
          await onPdfLoaded(base64);
        } catch (err) {
          console.error('PDF read error:', err);
        }
      };
      // Handle cancel (input loses focus without selecting)
      input.addEventListener('cancel', () => {
        document.body.removeChild(input);
      });
      input.click();
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      const uri = file.uri;
      let base64;

      try {
        // Try direct read first (works for file:// URIs from cache copy)
        base64 = await readFileAsBase64(uri);
      } catch (_) {
        // Fallback: SAF read for content:// URIs
        base64 = await SAF.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      await onPdfLoaded(base64);
    } catch (e) {
      console.error('PDF pick error:', e);
      Alert.alert('Error', 'Could not load the PDF file.\n' + (e.message || ''));
    }
  };

  const onPdfLoaded = async (base64) => {
    await savePdfToFS(activeProjectId, base64);
    pendingPdfBase64.current = base64;
    setHasPdf(true);
    const projects = await getProjects();
    const annotations = projects[activeProjectId]?.annotations || [];
    // If webview is already up, send immediately
    if (webviewReady) {
      sendToWebView('loadPdf', base64);
      setTimeout(() => sendToWebView('setAnnotations', annotations), 200);
    }
    // Otherwise onWebViewReady will handle it when the WebView mounts
  };

  // Shared message handler logic
  const processMessage = async (msg) => {
    switch (msg.type) {
      case 'webviewReady':
        onWebViewReady();
        break;
      case 'pdfLoaded':
        setPageInfo({ page: 1, total: msg.data.numPages });
        break;
      case 'pageChanged':
        setPageInfo({ page: msg.data.page, total: msg.data.total });
        break;
      case 'annotationsChanged':
        if (activeProjectId) {
          await saveAnnotations(activeProjectId, msg.data);
        }
        break;
      case 'requestNote':
        setPendingNotePos(msg.data);
        setNoteText('');
        setNoteModalVisible(true);
        break;
    }
  };

  // Native WebView onMessage handler
  const handleWebViewMessage = async (event) => {
    try {
      const raw = event.nativeEvent.data;
      const msg = JSON.parse(raw);
      await processMessage(msg);
    } catch (e) {}
  };

  // Keep the ref always pointing to the latest processMessage
  processMessageRef.current = processMessage;

  const handleSetTool = (tool) => {
    const newTool = activeTool === tool ? null : tool;
    setActiveTool(newTool);
    sendToWebView('setTool', newTool);
  };

  const handleSetColor = (color) => {
    setActiveColor(color);
    sendToWebView('setColor', color);
  };

  const handleAddNote = () => {
    const text = noteText.trim();
    if (!text || !pendingNotePos) return;
    const note = {
      id: 'a_' + Date.now(),
      type: 'note',
      page: pendingNotePos.page,
      x: pendingNotePos.x,
      y: pendingNotePos.y,
      text,
      color: activeColor,
    };
    sendToWebView('addNote', note);
    setNoteModalVisible(false);
    setPendingNotePos(null);
    setNoteText('');
  };

  const goToPage = (delta) => {
    const newPage = pageInfo.page + delta;
    if (newPage >= 1 && newPage <= pageInfo.total) {
      setPageInfo((prev) => ({ ...prev, page: newPage }));
      sendToWebView('goToPage', newPage);
    }
  };

  // ====== Counters Logic ======
  const saveCounterData = async (updated) => {
    setCounters(updated);
    if (activeProjectId) await saveCounters(activeProjectId, updated);
  };

  const getFlashAnim = (idx) => {
    if (!flashAnims[idx]) flashAnims[idx] = new Animated.Value(0);
    return flashAnims[idx];
  };

  const flashCounter = (idx) => {
    const anim = getFlashAnim(idx);
    anim.setValue(1);
    Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: false }).start();
  };

  const incrementCounter = (idx, list, depth) => {
    if (depth > 20) return list;
    list[idx].value++;
    if (list[idx].max && list[idx].value >= list[idx].max) {
      list[idx].value = 0;
      flashCounter(idx);
      const linkedIdx = list[idx].linkedTo;
      if (linkedIdx != null && linkedIdx >= 0 && linkedIdx < list.length) {
        list = incrementCounter(linkedIdx, list, depth + 1);
      }
    }
    return list;
  };

  const handleIncrement = (idx) => {
    let updated = counters.map((c) => ({ ...c }));
    updated = incrementCounter(idx, updated, 0);
    saveCounterData(updated);
  };

  const handleDecrement = (idx) => {
    const updated = counters.map((c) => ({ ...c }));
    updated[idx].value = Math.max(0, updated[idx].value - 1);
    saveCounterData(updated);
  };

  const handleAddCounter = () => {
    const name = newCounterName.trim() || 'Counter';
    const rawMax = parseInt(newCounterMax, 10);
    const max = !isNaN(rawMax) && rawMax > 0 ? rawMax : null;
    saveCounterData([...counters, { name, value: 0, max, linkedTo: null }]);
    setAddCounterModal(false);
    setNewCounterName('');
    setNewCounterMax('');
  };

  const handleRemoveCounter = (idx) => {
    Alert.alert('Remove Counter', `Remove "${counters[idx].name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const updated = counters
            .filter((_, i) => i !== idx)
            .map((c) => {
              let linked = c.linkedTo;
              if (linked === idx) linked = null;
              else if (linked != null && linked > idx) linked--;
              return { ...c, linkedTo: linked };
            });
          saveCounterData(updated);
        },
      },
    ]);
  };

  const openLinkModal = (idx) => {
    if (!counters[idx].max) {
      Alert.alert('Set Maximum First', `Set a maximum on "${counters[idx].name}" before linking.`);
      return;
    }
    setLinkSourceIdx(idx);
    setLinkModalVisible(true);
  };

  const handleLink = (targetIdx) => {
    if (linkSourceIdx == null) return;
    const updated = counters.map((c) => ({ ...c }));
    updated[linkSourceIdx].linkedTo = targetIdx;
    saveCounterData(updated);
    setLinkModalVisible(false);
  };

  const handleUnlink = () => {
    if (linkSourceIdx == null) return;
    const updated = counters.map((c) => ({ ...c }));
    updated[linkSourceIdx].linkedTo = null;
    saveCounterData(updated);
    setLinkModalVisible(false);
  };

  const handleRenameConfirm = () => {
    if (renameIdx != null && renameText.trim()) {
      const updated = counters.map((c) => ({ ...c }));
      updated[renameIdx].name = renameText.trim().slice(0, 20);
      saveCounterData(updated);
    }
    setRenameModalVisible(false);
  };

  const handleEditMaxConfirm = () => {
    if (editMaxIdx != null) {
      const updated = counters.map((c) => ({ ...c }));
      const val = parseInt(editMaxText.trim(), 10);
      updated[editMaxIdx].max = !isNaN(val) && val > 0 ? val : null;
      if (!updated[editMaxIdx].max) updated[editMaxIdx].linkedTo = null;
      saveCounterData(updated);
    }
    setEditMaxModalVisible(false);
  };

  // ====== Empty states ======
  if (!activeProjectId) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📖</Text>
        <Text style={styles.emptyTitle}>No project selected</Text>
        <Text style={styles.emptySub}>
          Select a project in the Projects tab to start working.
        </Text>
      </View>
    );
  }

  // ====== Render ======
  return (
    <View style={styles.container}>
      {/* ===== COUNTERS BAR ===== */}
      <TouchableOpacity
        style={styles.countersHeader}
        onPress={() => setCountersOpen(!countersOpen)}
        activeOpacity={0.7}
      >
        <Ionicons name="speedometer" size={14} color={COLORS.gold} />
        <Text style={styles.countersTitle}>
          Counters{counters.length > 0 ? ` (${counters.length})` : ''}
        </Text>
        {/* Quick view of values when collapsed */}
        {!countersOpen && counters.length > 0 && (
          <View style={styles.countersMini}>
            {counters.slice(0, 4).map((c, i) => (
              <Text key={i} style={styles.countersMiniText}>
                {c.name}: {c.value}{c.max ? `/${c.max}` : ''}
              </Text>
            ))}
            {counters.length > 4 && (
              <Text style={styles.countersMiniText}>+{counters.length - 4}</Text>
            )}
          </View>
        )}
        <Ionicons
          name={countersOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={COLORS.gold}
        />
      </TouchableOpacity>

      {countersOpen && (
        <View style={styles.countersPanel}>
          <ScrollView
            horizontal={false}
            style={styles.countersScroll}
            contentContainerStyle={styles.countersScrollContent}
            nestedScrollEnabled
          >
            {counters.map((c, idx) => {
              const anim = getFlashAnim(idx);
              const bgColor = anim.interpolate({
                inputRange: [0, 1],
                outputRange: [COLORS.paper, COLORS.gold],
              });
              const linkedName =
                c.linkedTo != null && c.linkedTo >= 0 && c.linkedTo < counters.length
                  ? counters[c.linkedTo].name : null;

              return (
                <Animated.View
                  key={idx}
                  style={[styles.counterChip, { backgroundColor: bgColor }]}
                >
                  <TouchableOpacity
                    style={styles.counterNameArea}
                    onPress={() => {
                      setRenameIdx(idx);
                      setRenameText(c.name);
                      setRenameModalVisible(true);
                    }}
                  >
                    <Text style={styles.counterChipName} numberOfLines={1}>{c.name}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cBtn} onPress={() => handleDecrement(idx)}>
                    <Text style={styles.cBtnText}>−</Text>
                  </TouchableOpacity>

                  <Text style={styles.counterChipValue}>{c.value}</Text>

                  {c.max && (
                    <TouchableOpacity onPress={() => {
                      setEditMaxIdx(idx);
                      setEditMaxText(String(c.max));
                      setEditMaxModalVisible(true);
                    }}>
                      <Text style={styles.counterChipMax}>/{c.max}</Text>
                    </TouchableOpacity>
                  )}
                  {!c.max && (
                    <TouchableOpacity onPress={() => {
                      setEditMaxIdx(idx);
                      setEditMaxText('');
                      setEditMaxModalVisible(true);
                    }}>
                      <Text style={styles.counterSetMax}>∞</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.cBtn} onPress={() => handleIncrement(idx)}>
                    <Text style={styles.cBtnText}>+</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cLink, linkedName && styles.cLinkActive]}
                    onPress={() => openLinkModal(idx)}
                  >
                    <Ionicons name="link" size={12} color={linkedName ? COLORS.gold : COLORS.sage} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleRemoveCounter(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={14} color={COLORS.rust} />
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={styles.addCounterRow}
            onPress={() => setAddCounterModal(true)}
          >
            <Ionicons name="add-circle-outline" size={16} color={COLORS.gold} />
            <Text style={styles.addCounterText}>Add Counter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== TOOLBAR ===== */}
      {hasPdf && (
        <View style={styles.toolbar}>
          <View style={styles.toolGroup}>
            <TouchableOpacity
              style={[styles.toolBtn, activeTool === 'highlight' && styles.toolBtnActive]}
              onPress={() => handleSetTool('highlight')}
            >
              <Ionicons name="color-fill" size={15} color={activeTool === 'highlight' ? COLORS.warmWhite : COLORS.brown} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, activeTool === 'note' && styles.toolBtnActive]}
              onPress={() => handleSetTool('note')}
            >
              <Ionicons name="create" size={15} color={activeTool === 'note' ? COLORS.warmWhite : COLORS.brown} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, activeTool === 'eraser' && styles.toolBtnActive]}
              onPress={() => handleSetTool('eraser')}
            >
              <Ionicons name="cut" size={15} color={activeTool === 'eraser' ? COLORS.warmWhite : COLORS.brown} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroup}>
            {TOOL_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorDot,
                  { backgroundColor: HIGHLIGHT_SOLID[color] },
                  activeColor === color && styles.colorDotSelected,
                ]}
                onPress={() => handleSetColor(color)}
              />
            ))}
          </View>
          <View style={styles.toolGroup}>
            <TouchableOpacity style={styles.toolBtn} onPress={() => goToPage(-1)}>
              <Ionicons name="chevron-back" size={14} color={COLORS.brown} />
            </TouchableOpacity>
            <Text style={styles.pageText}>{pageInfo.page}/{pageInfo.total}</Text>
            <TouchableOpacity style={styles.toolBtn} onPress={() => goToPage(1)}>
              <Ionicons name="chevron-forward" size={14} color={COLORS.brown} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.toolBtn} onPress={handlePickPdf}>
            <Ionicons name="swap-horizontal" size={14} color={COLORS.brown} />
          </TouchableOpacity>
          {activeTool && (
            <View style={styles.modeBadge}>
              <Text style={styles.modeBadgeText}>{activeTool.toUpperCase()}</Text>
            </View>
          )}
        </View>
      )}

      {/* ===== CONTENT ===== */}
      {hasPdf ? (
        isWeb ? (
          <View style={{ flex: 1 }}>
            <iframe
              ref={webviewRef}
              srcDoc={getPdfViewerHtml()}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#334155',
              }}
              sandbox="allow-scripts allow-same-origin"
            />
          </View>
        ) : (
          <WebView
            ref={webviewRef}
            source={{ html: getPdfViewerHtml() }}
            style={styles.webview}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            scalesPageToFit={false}
            scrollEnabled={false}
            nestedScrollEnabled
          />
        )
      ) : (
        <View style={styles.emptyPdf}>
          <Text style={styles.emptyIcon}>📄</Text>
          <Text style={styles.emptyTitle}>Load your pattern</Text>
          <Text style={styles.emptySub}>
            Pick a PDF knitting pattern to start reading, highlighting, and annotating.
          </Text>
          <TouchableOpacity style={styles.loadBtn} onPress={handlePickPdf}>
            <Ionicons name="document-attach" size={20} color={COLORS.brown} />
            <Text style={styles.loadBtnText}>Load PDF Pattern</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== MODALS ===== */}
      {/* Note Modal */}
      <Modal visible={noteModalVisible} transparent animationType="fade" onRequestClose={() => setNoteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Note</Text>
            <Text style={styles.label}>Note Text</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Your annotation here..."
              placeholderTextColor={COLORS.sage}
              value={noteText}
              onChangeText={setNoteText}
              maxLength={200}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setNoteModalVisible(false)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleAddNote}>
                <Text style={styles.btnConfirmText}>Pin Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Counter Modal */}
      <Modal visible={addCounterModal} transparent animationType="fade" onRequestClose={() => setAddCounterModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Counter</Text>
            <Text style={styles.label}>Counter Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Row, Repeat, Stitch"
              placeholderTextColor={COLORS.sage}
              value={newCounterName}
              onChangeText={setNewCounterName}
              maxLength={20}
              autoFocus
            />
            <Text style={styles.label}>Maximum (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10, 24, 40"
              placeholderTextColor={COLORS.sage}
              value={newCounterMax}
              onChangeText={setNewCounterMax}
              keyboardType="numeric"
              onSubmitEditing={handleAddCounter}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => { setAddCounterModal(false); setNewCounterName(''); setNewCounterMax(''); }}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleAddCounter}>
                <Text style={styles.btnConfirmText}>Add Counter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Link Counter Modal */}
      <Modal visible={linkModalVisible} transparent animationType="fade" onRequestClose={() => setLinkModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Link Counter</Text>
            {linkSourceIdx != null && (
              <Text style={styles.linkDesc}>
                When <Text style={{ fontWeight: '700', color: COLORS.rust }}>{counters[linkSourceIdx]?.name}</Text> resets to 0, which counter should increase?
              </Text>
            )}
            <View style={{ gap: 8, marginBottom: 14 }}>
              {counters.map((tc, ti) => {
                if (ti === linkSourceIdx) return null;
                const isLinked = linkSourceIdx != null && counters[linkSourceIdx]?.linkedTo === ti;
                return (
                  <TouchableOpacity key={ti} style={[styles.linkOption, isLinked && styles.linkOptionActive]} onPress={() => handleLink(ti)}>
                    <Text style={styles.linkOptionText}>{tc.name}</Text>
                    {isLinked && <Text style={styles.linkOptionCheck}>✓ linked</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={handleUnlink}>
                <Text style={styles.btnCancelText}>Remove Link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setLinkModalVisible(false)}>
                <Text style={styles.btnCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Rename Counter</Text>
            <TextInput style={styles.input} value={renameText} onChangeText={setRenameText} maxLength={20} autoFocus selectTextOnFocus onSubmitEditing={handleRenameConfirm} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setRenameModalVisible(false)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleRenameConfirm}>
                <Text style={styles.btnConfirmText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Max Modal */}
      <Modal visible={editMaxModalVisible} transparent animationType="fade" onRequestClose={() => setEditMaxModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Set Maximum</Text>
            <Text style={styles.labelHint}>Leave blank to remove the maximum</Text>
            <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={COLORS.sage} value={editMaxText} onChangeText={setEditMaxText} keyboardType="numeric" autoFocus selectTextOnFocus onSubmitEditing={handleEditMaxConfirm} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setEditMaxModalVisible(false)}>
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleEditMaxConfirm}>
                <Text style={styles.btnConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },

  // Counters bar
  countersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  countersTitle: {
    color: COLORS.rust,
    fontSize: 12,
    fontFamily: 'LibreBaskerville_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  countersMini: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    marginLeft: 4,
  },
  countersMiniText: {
    color: COLORS.sage,
    fontSize: 11,
    fontWeight: '600',
  },
  countersPanel: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    maxHeight: 200,
  },
  countersScroll: { maxHeight: 160 },
  countersScrollContent: { gap: 6, paddingBottom: 4 },
  counterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warmWhite,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
  },
  counterNameArea: { flex: 1, paddingHorizontal: 6, paddingVertical: 4 },
  counterChipName: { fontSize: 12, fontWeight: '700', color: COLORS.brown, letterSpacing: 0.3 },
  cBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: COLORS.rust,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  counterChipValue: { fontSize: 20, fontWeight: '800', color: COLORS.ink, minWidth: 28, textAlign: 'center' },
  counterChipMax: { fontSize: 12, color: COLORS.sage, fontWeight: '600' },
  counterSetMax: { fontSize: 14, color: COLORS.sage, fontWeight: '600', opacity: 0.6, paddingHorizontal: 2 },
  cLink: { padding: 4, borderRadius: 3, borderWidth: 1, borderColor: COLORS.border },
  cLinkActive: { backgroundColor: COLORS.rust, borderColor: COLORS.rust },
  addCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(59,130,246,0.2)',
    marginTop: 4,
  },
  addCounterText: { color: COLORS.rust, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 5,
    flexWrap: 'wrap',
    elevation: 2,
  },
  toolGroup: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: 5, borderRightWidth: 1, borderRightColor: COLORS.border },
  toolBtn: { backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, padding: 7 },
  toolBtnActive: { backgroundColor: COLORS.rust, borderColor: '#1d4ed8' },
  colorDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(0,0,0,0.1)' },
  colorDotSelected: { borderWidth: 3, borderColor: COLORS.rust },
  pageText: { fontSize: 11, color: COLORS.brown, fontWeight: '700', minWidth: 38, textAlign: 'center' },
  modeBadge: { backgroundColor: COLORS.brown, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 },
  modeBadgeText: { fontSize: 8, color: COLORS.white, fontWeight: '800', letterSpacing: 1 },

  // WebView
  webview: { flex: 1, backgroundColor: '#334155' },

  // Empty states
  empty: { flex: 1, backgroundColor: COLORS.cream, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyPdf: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontFamily: 'LibreBaskerville_700Bold', color: COLORS.brown, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, fontFamily: 'LibreBaskerville_400Regular', color: COLORS.sage, textAlign: 'center', lineHeight: 22, maxWidth: 280, marginBottom: 24 },
  loadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.rust, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 6, gap: 8, elevation: 3 },
  loadBtnText: { color: COLORS.white, fontFamily: 'LibreBaskerville_700Bold', fontSize: 14, letterSpacing: 0.3 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10,22,40,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 24, width: '100%', maxWidth: 360, elevation: 12 },
  modalTitle: { fontSize: 20, fontFamily: 'LibreBaskerville_700Bold', color: COLORS.brown, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.sage, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  labelHint: { fontSize: 11, color: COLORS.sage, fontStyle: 'italic', marginBottom: 8, opacity: 0.7 },
  input: { backgroundColor: COLORS.warmWhite, borderWidth: 2, borderColor: COLORS.border, borderRadius: 4, padding: 12, fontSize: 15, color: COLORS.ink, marginBottom: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  btnCancel: { borderWidth: 2, borderColor: COLORS.gold, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 3 },
  btnCancelText: { color: COLORS.gold, fontWeight: '700', fontSize: 13 },
  btnConfirm: { backgroundColor: COLORS.rust, borderWidth: 2, borderColor: '#1d4ed8', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 3, elevation: 2 },
  btnConfirmText: { color: COLORS.warmWhite, fontWeight: '700', fontSize: 13 },
  linkDesc: { fontSize: 14, color: COLORS.brown, lineHeight: 22, marginBottom: 14 },
  linkOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.warmWhite, borderWidth: 2, borderColor: COLORS.border, borderRadius: 4, padding: 12 },
  linkOptionActive: { borderColor: COLORS.rust, backgroundColor: '#eff6ff' },
  linkOptionText: { fontSize: 14, fontWeight: '600', color: COLORS.brown },
  linkOptionCheck: { fontSize: 12, color: COLORS.rust, fontWeight: '700' },
});
