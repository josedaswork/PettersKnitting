import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getProjects, createProject, deleteProject } from '../storage';
import { COLORS } from '../theme';

export default function ProjectsScreen({ activeProjectId, onSelectProject, refreshKey }) {
  const [projects, setProjects] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');

  const loadProjects = async () => {
    const data = await getProjects();
    setProjects(data);
  };

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [refreshKey])
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please enter a project name.');
      return;
    }
    const { id, projects: updated } = await createProject(name);
    setProjects(updated);
    setModalVisible(false);
    setNewName('');
    onSelectProject(id, name);
  };

  const handleDelete = (id, name) => {
    Alert.alert(
      'Delete Project',
      `Delete "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = await deleteProject(id);
            setProjects(updated);
            if (activeProjectId === id) {
              onSelectProject(null, '');
            }
          },
        },
      ]
    );
  };

  const sortedIds = Object.keys(projects).sort(
    (a, b) => (projects[b].created || 0) - (projects[a].created || 0)
  );

  const renderProject = ({ item: id }) => {
    const p = projects[id];
    const isActive = id === activeProjectId;
    const countersCount = p.counters?.length || 0;
    const annotationsCount = p.annotations?.length || 0;
    const date = new Date(p.created).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive]}
        onPress={() => onSelectProject(id, p.name)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Text style={styles.cardIconText}>🧶</Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={2}>
              {p.name}
            </Text>
            <Text style={styles.cardDate}>{date}</Text>
          </View>
          {isActive && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}
        </View>
        <View style={styles.cardFooter}>
          <View style={styles.stat}>
            <Ionicons name="speedometer-outline" size={14} color={COLORS.sage} />
            <Text style={styles.statText}>
              {countersCount} counter{countersCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="brush-outline" size={14} color={COLORS.sage} />
            <Text style={styles.statText}>
              {annotationsCount} annotation{annotationsCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(id, p.name)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.rust} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {sortedIds.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🧶</Text>
            <Text style={styles.emptyTitle}>Start your first project</Text>
          <Text style={styles.emptySub}>
            Create a new knitting project, load your PDF pattern, and start
            tracking rows with counters.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add-circle" size={20} color={COLORS.brown} />
            <Text style={styles.emptyBtnText}>New Project</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={sortedIds}
            keyExtractor={(id) => id}
            renderItem={renderProject}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={28} color={COLORS.brown} />
          </TouchableOpacity>
        </>
      )}

      {/* New Project Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Knitting Project</Text>
            <Text style={styles.label}>Project Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Cosy Winter Cardigan"
              placeholderTextColor={COLORS.sage}
              value={newName}
              onChangeText={setNewName}
              maxLength={60}
              autoFocus
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => {
                  setModalVisible(false);
                  setNewName('');
                }}
              >
                <Text style={styles.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnCreate} onPress={handleCreate}>
                <Text style={styles.btnCreateText}>Create Project</Text>
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
  card: {
    backgroundColor: COLORS.warmWhite,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  cardActive: {
    borderColor: COLORS.rust,
    backgroundColor: '#eff6ff',
    elevation: 4,
    shadowOpacity: 0.2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardIconText: {
    fontSize: 22,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontFamily: 'LibreBaskerville_700Bold',
    color: COLORS.brown,
    letterSpacing: 0.3,
  },
  cardDate: {
    fontSize: 11,
    color: COLORS.sage,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  activeBadge: {
    backgroundColor: COLORS.rust,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  activeBadgeText: {
    color: COLORS.warmWhite,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.paper,
    paddingTop: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: COLORS.sage,
    letterSpacing: 0.3,
  },
  deleteBtn: {
    marginLeft: 'auto',
    padding: 4,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'LibreBaskerville_700Bold',
    color: COLORS.brown,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    fontFamily: 'LibreBaskerville_400Regular',
    color: COLORS.sage,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.75,
    marginBottom: 24,
    maxWidth: 280,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.rust,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 6,
    gap: 8,
    elevation: 3,
  },
  emptyBtnText: {
    color: COLORS.white,
    fontFamily: 'LibreBaskerville_700Bold',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.rust,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,22,40,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'LibreBaskerville_700Bold',
    color: COLORS.brown,
    marginBottom: 16,
    borderBottomWidth: 1,
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
  input: {
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    fontSize: 15,
    color: COLORS.ink,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btnCancel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  btnCancelText: {
    color: COLORS.sage,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  btnCreate: {
    backgroundColor: COLORS.rust,
    borderWidth: 0,
    borderColor: '#1d4ed8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 3,
    elevation: 2,
  },
  btnCreateText: {
    color: COLORS.warmWhite,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
