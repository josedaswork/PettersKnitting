import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getProjects, saveCounters } from '../storage';
import { COLORS } from '../theme';

export default function CountersScreen({ activeProjectId, onRefresh }) {
  const [counters, setCounters] = useState([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [newCounterName, setNewCounterName] = useState('');
  const [newCounterMax, setNewCounterMax] = useState('');
  const [linkSourceIdx, setLinkSourceIdx] = useState(null);
  const flashAnims = useRef({}).current;

  const load = async () => {
    if (!activeProjectId) return;
    const projects = await getProjects();
    const p = projects[activeProjectId];
    setCounters(p?.counters || []);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [activeProjectId])
  );

  const save = async (updated) => {
    setCounters(updated);
    if (activeProjectId) {
      await saveCounters(activeProjectId, updated);
    }
  };

  const getFlashAnim = (idx) => {
    if (!flashAnims[idx]) {
      flashAnims[idx] = new Animated.Value(0);
    }
    return flashAnims[idx];
  };

  const flashCounter = (idx) => {
    const anim = getFlashAnim(idx);
    anim.setValue(1);
    Animated.timing(anim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: false,
    }).start();
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
    let updated = [...counters.map((c) => ({ ...c }))];
    updated = incrementCounter(idx, updated, 0);
    save(updated);
  };

  const handleDecrement = (idx) => {
    const updated = [...counters.map((c) => ({ ...c }))];
    updated[idx].value = Math.max(0, updated[idx].value - 1);
    save(updated);
  };

  const handleAdd = () => {
    const name = newCounterName.trim() || 'Counter';
    const rawMax = parseInt(newCounterMax, 10);
    const max = !isNaN(rawMax) && rawMax > 0 ? rawMax : null;
    const updated = [...counters, { name, value: 0, max, linkedTo: null }];
    save(updated);
    setAddModalVisible(false);
    setNewCounterName('');
    setNewCounterMax('');
  };

  const handleRemove = (idx) => {
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
          save(updated);
        },
      },
    ]);
  };

  const handleRename = (idx) => {
    Alert.prompt
      ? Alert.prompt('Rename Counter', '', (text) => {
          if (text && text.trim()) {
            const updated = [...counters.map((c) => ({ ...c }))];
            updated[idx].name = text.trim().slice(0, 20);
            save(updated);
          }
        }, 'plain-text', counters[idx].name)
      : (() => {
          // Android fallback: use a simple approach
          setRenameIdx(idx);
          setRenameText(counters[idx].name);
          setRenameModalVisible(true);
        })();
  };

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameIdx, setRenameIdx] = useState(null);
  const [renameText, setRenameText] = useState('');

  const handleRenameConfirm = () => {
    if (renameIdx != null && renameText.trim()) {
      const updated = [...counters.map((c) => ({ ...c }))];
      updated[renameIdx].name = renameText.trim().slice(0, 20);
      save(updated);
    }
    setRenameModalVisible(false);
    setRenameIdx(null);
    setRenameText('');
  };

  const handleEditMax = (idx) => {
    setEditMaxIdx(idx);
    setEditMaxText(counters[idx].max ? String(counters[idx].max) : '');
    setEditMaxModalVisible(true);
  };

  const [editMaxModalVisible, setEditMaxModalVisible] = useState(false);
  const [editMaxIdx, setEditMaxIdx] = useState(null);
  const [editMaxText, setEditMaxText] = useState('');

  const handleEditMaxConfirm = () => {
    if (editMaxIdx != null) {
      const updated = [...counters.map((c) => ({ ...c }))];
      const val = parseInt(editMaxText.trim(), 10);
      updated[editMaxIdx].max = !isNaN(val) && val > 0 ? val : null;
      if (!updated[editMaxIdx].max) updated[editMaxIdx].linkedTo = null;
      save(updated);
    }
    setEditMaxModalVisible(false);
    setEditMaxIdx(null);
    setEditMaxText('');
  };

  const openLinkModal = (idx) => {
    if (!counters[idx].max) {
      Alert.alert(
        'Set Maximum First',
        `Set a maximum on "${counters[idx].name}" before linking it.`
      );
      return;
    }
    setLinkSourceIdx(idx);
    setLinkModalVisible(true);
  };

  const handleLink = (targetIdx) => {
    if (linkSourceIdx == null) return;
    const updated = [...counters.map((c) => ({ ...c }))];
    updated[linkSourceIdx].linkedTo = targetIdx;
    save(updated);
    setLinkModalVisible(false);
    setLinkSourceIdx(null);
  };

  const handleUnlink = () => {
    if (linkSourceIdx == null) return;
    const updated = [...counters.map((c) => ({ ...c }))];
    updated[linkSourceIdx].linkedTo = null;
    save(updated);
    setLinkModalVisible(false);
    setLinkSourceIdx(null);
  };

  const renderCounter = ({ item, index }) => {
    const c = item;
    const anim = getFlashAnim(index);
    const bgColor = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [COLORS.warmWhite, COLORS.gold],
    });

    const linkedName =
      c.linkedTo != null && c.linkedTo >= 0 && c.linkedTo < counters.length
        ? counters[c.linkedTo].name
        : null;

    // Find if any counter is driven by this one
    const drivenBy = counters.findIndex(
      (cc, ii) => ii !== index && cc.linkedTo === index && cc.max
    );

    return (
      <Animated.View style={[styles.counterCard, { backgroundColor: bgColor }]}>
        {/* Header */}
        <View style={styles.counterHeader}>
          <TouchableOpacity
            onPress={() => {
              setRenameIdx(index);
              setRenameText(c.name);
              setRenameModalVisible(true);
            }}
            style={styles.counterNameBtn}
          >
            <Text style={styles.counterName} numberOfLines={1}>
              {c.name}
            </Text>
            <Ionicons name="pencil-outline" size={12} color={COLORS.sage} />
          </TouchableOpacity>
          <View style={styles.counterBadges}>
            {drivenBy >= 0 && (
              <View style={styles.drivenBadge}>
                <Ionicons name="arrow-up" size={10} color={COLORS.sage} />
                <Text style={styles.drivenText}>{counters[drivenBy].name}</Text>
              </View>
            )}
            {linkedName && (
              <View style={styles.linkedBadge}>
                <Ionicons name="link" size={10} color={COLORS.gold} />
                <Text style={styles.linkedText}>→ {linkedName}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => handleRemove(index)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={22} color={COLORS.rust} />
          </TouchableOpacity>
        </View>

        {/* Value Display */}
        <View style={styles.counterBody}>
          <TouchableOpacity
            style={styles.counterBtn}
            onPress={() => handleDecrement(index)}
            activeOpacity={0.6}
          >
            <Ionicons name="remove" size={28} color={COLORS.gold} />
          </TouchableOpacity>

          <View style={styles.counterValueContainer}>
            <Text style={styles.counterValue}>{c.value}</Text>
            {c.max && (
              <TouchableOpacity onPress={() => handleEditMax(index)}>
                <Text style={styles.counterMax}>/ {c.max}</Text>
              </TouchableOpacity>
            )}
            {!c.max && (
              <TouchableOpacity onPress={() => handleEditMax(index)}>
                <Text style={styles.counterSetMax}>set max</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.counterBtn}
            onPress={() => handleIncrement(index)}
            activeOpacity={0.6}
          >
            <Ionicons name="add" size={28} color={COLORS.gold} />
          </TouchableOpacity>
        </View>

        {/* Footer with link button */}
        <View style={styles.counterFooter}>
          <TouchableOpacity
            style={[styles.linkBtn, linkedName && styles.linkBtnActive]}
            onPress={() => openLinkModal(index)}
          >
            <Ionicons
              name="link"
              size={14}
              color={linkedName ? COLORS.gold : COLORS.sage}
            />
            <Text
              style={[styles.linkBtnText, linkedName && styles.linkBtnTextActive]}
            >
              {linkedName ? 'Linked' : 'Link Counter'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  if (!activeProjectId) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🔢</Text>
        <Text style={styles.emptyTitle}>No project selected</Text>
        <Text style={styles.emptySub}>
          Select a project in the Projects tab to manage its counters.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={counters}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderCounter}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyIcon}>🧮</Text>
            <Text style={styles.emptyTitle}>No counters yet</Text>
            <Text style={styles.emptySub}>
              Add counters to track rows, repeats, stitches, and more.
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={COLORS.brown} />
      </TouchableOpacity>

      {/* Add Counter Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
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
            <Text style={styles.labelHint}>Resets to 0 when reached</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10, 24, 40"
              placeholderTextColor={COLORS.sage}
              value={newCounterMax}
              onChangeText={setNewCounterMax}
              keyboardType="numeric"
              onSubmitEditing={handleAdd}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => {
                  setAddModalVisible(false);
                  setNewCounterName('');
                  setNewCounterMax('');
                }}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={handleAdd}>
                <Text style={styles.btnConfirmText}>Add Counter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Link Counter Modal */}
      <Modal
        visible={linkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Link Counter</Text>
            {linkSourceIdx != null && (
              <Text style={styles.linkDesc}>
                When{' '}
                <Text style={{ fontWeight: '700', color: COLORS.rust }}>
                  {counters[linkSourceIdx]?.name}
                </Text>{' '}
                resets to 0, which counter should increase?
              </Text>
            )}
            <View style={styles.linkList}>
              {counters.map((tc, ti) => {
                if (ti === linkSourceIdx) return null;
                const isLinked =
                  linkSourceIdx != null &&
                  counters[linkSourceIdx]?.linkedTo === ti;
                return (
                  <TouchableOpacity
                    key={ti}
                    style={[styles.linkOption, isLinked && styles.linkOptionActive]}
                    onPress={() => handleLink(ti)}
                  >
                    <Text style={styles.linkOptionText}>{tc.name}</Text>
                    {isLinked && (
                      <Text style={styles.linkOptionCheck}>✓ linked</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              {counters.length <= 1 && (
                <Text style={styles.linkEmpty}>
                  Add more counters to link them.
                </Text>
              )}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnCancel} onPress={handleUnlink}>
                <Text style={styles.btnCancelText}>Remove Link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setLinkModalVisible(false)}
              >
                <Text style={styles.btnCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Rename Counter</Text>
            <TextInput
              style={styles.input}
              value={renameText}
              onChangeText={setRenameText}
              maxLength={20}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleRenameConfirm}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnConfirm}
                onPress={handleRenameConfirm}
              >
                <Text style={styles.btnConfirmText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Max Modal */}
      <Modal
        visible={editMaxModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditMaxModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Set Maximum</Text>
            <Text style={styles.labelHint}>
              Leave blank to remove the maximum
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 10"
              placeholderTextColor={COLORS.sage}
              value={editMaxText}
              onChangeText={setEditMaxText}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleEditMaxConfirm}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setEditMaxModalVisible(false)}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnConfirm}
                onPress={handleEditMaxConfirm}
              >
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
  container: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  counterCard: {
    backgroundColor: COLORS.warmWhite,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    elevation: 3,
    shadowColor: COLORS.brown,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  counterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  counterNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  counterName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.brown,
    letterSpacing: 0.5,
  },
  counterBadges: {
    flexDirection: 'row',
    gap: 6,
    marginRight: 8,
  },
  drivenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.paper,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    gap: 2,
  },
  drivenText: {
    fontSize: 9,
    color: COLORS.sage,
    fontWeight: '600',
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.brown,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    gap: 2,
  },
  linkedText: {
    fontSize: 9,
    color: COLORS.gold,
    fontWeight: '600',
  },
  counterBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  counterBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.brown,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  counterValueContainer: {
    alignItems: 'center',
    minWidth: 80,
  },
  counterValue: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: 1,
  },
  counterMax: {
    fontSize: 14,
    color: COLORS.darkGold,
    fontWeight: '600',
    marginTop: 2,
  },
  counterSetMax: {
    fontSize: 11,
    color: COLORS.sage,
    fontStyle: 'italic',
    marginTop: 2,
    opacity: 0.7,
  },
  counterFooter: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.paper,
    paddingTop: 8,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 3,
    borderStyle: 'dashed',
  },
  linkBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.brown,
    borderStyle: 'solid',
  },
  linkBtnText: {
    fontSize: 11,
    color: COLORS.sage,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  linkBtnTextActive: {
    color: COLORS.gold,
  },
  empty: {
    flex: 1,
    backgroundColor: COLORS.cream,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyList: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.brown,
    marginBottom: 8,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    color: COLORS.brown,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.75,
    maxWidth: 260,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: COLORS.brown,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.darkGold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(42,26,8,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: COLORS.cream,
    borderWidth: 3,
    borderColor: COLORS.gold,
    borderRadius: 6,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.brown,
    marginBottom: 16,
    fontStyle: 'italic',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.sage,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  labelHint: {
    fontSize: 11,
    color: COLORS.sage,
    fontStyle: 'italic',
    marginBottom: 8,
    opacity: 0.7,
  },
  input: {
    backgroundColor: COLORS.warmWhite,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
    fontSize: 15,
    color: COLORS.ink,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  btnCancel: {
    borderWidth: 2,
    borderColor: COLORS.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 3,
  },
  btnCancelText: {
    color: COLORS.gold,
    fontWeight: '700',
    fontSize: 13,
  },
  btnConfirm: {
    backgroundColor: COLORS.rust,
    borderWidth: 2,
    borderColor: '#8a3410',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 3,
    elevation: 2,
  },
  btnConfirmText: {
    color: COLORS.warmWhite,
    fontWeight: '700',
    fontSize: 13,
  },
  linkDesc: {
    fontSize: 14,
    color: COLORS.brown,
    lineHeight: 22,
    marginBottom: 14,
  },
  linkList: {
    gap: 8,
    marginBottom: 14,
    maxHeight: 220,
  },
  linkOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.warmWhite,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
  },
  linkOptionActive: {
    borderColor: COLORS.rust,
    backgroundColor: '#fff3ee',
  },
  linkOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.brown,
  },
  linkOptionCheck: {
    fontSize: 12,
    color: COLORS.rust,
    fontWeight: '700',
  },
  linkEmpty: {
    fontSize: 13,
    color: COLORS.sage,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
