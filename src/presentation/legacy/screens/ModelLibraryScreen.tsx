import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ModelLibraryEntry } from '../../../core/parser/ai/ModelCatalog';
import { modelLibraryService } from '../../../app/composition';

const styles = {
  page: { flex: 1, backgroundColor: '#f7f8fa', padding: 16 },
  title: { color: '#1b1b1b', fontSize: 22, fontWeight: '700' as const, marginBottom: 8 },
  description: { color: '#555', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  name: { color: '#202124', fontSize: 17, fontWeight: '600' as const },
  meta: { color: '#5f6368', fontSize: 13, lineHeight: 19, marginTop: 6 },
  status: { color: '#174ea6', fontSize: 13, fontWeight: '600' as const, marginTop: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginTop: 12 },
  button: { backgroundColor: '#1a73e8', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, marginRight: 8, marginTop: 4 },
  secondary: { backgroundColor: '#e8eaed' },
  danger: { backgroundColor: '#fce8e6' },
  buttonText: { color: '#fff', fontWeight: '600' as const, fontSize: 13 },
  secondaryText: { color: '#202124' },
  empty: { backgroundColor: '#fff', borderRadius: 12, padding: 18 },
  emptyTitle: { color: '#202124', fontSize: 16, fontWeight: '600' as const, marginBottom: 6 },
  error: { color: '#b3261e', fontSize: 13, marginBottom: 10 },
  content: { paddingBottom: 28 },
  progress: { marginTop: 10 },
  removeText: { color: '#b3261e' },
};

export default function ModelLibraryScreen() {
  const [models, setModels] = useState<ModelLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cancelDownload, setCancelDownload] = useState<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setModels(await modelLibraryService.listModels());
    } catch {
      setError('Could not load the model library. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const install = async (model: ModelLibraryEntry) => {
    const key = `${model.id}@${model.version}`;
    setBusyKey(key);
    setProgress(0);
    setError(null);
    const operation = modelLibraryService.installModel(model.id, model.version, setProgress);
    setCancelDownload(() => operation.cancel);
    try {
      await operation.promise;
      await refresh();
    } catch {
      setError(`Could not install ${model.displayName}. Check your connection and available storage.`);
    } finally {
      setBusyKey(null);
      setCancelDownload(null);
    }
  };

  const remove = (model: ModelLibraryEntry) => {
    const confirmRemoval = async () => {
      setBusyKey(`${model.id}@${model.version}`);
      setError(null);
      try {
        await modelLibraryService.removeModel(model.id, model.version);
        await refresh();
      } catch {
        setError('Clear this model’s task assignment before removing it.');
      } finally {
        setBusyKey(null);
      }
    };
    Alert.alert('Remove model?', `${model.displayName} will be deleted from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: confirmRemoval,
      },
    ]);
  };

  const assignOrClear = async (model: ModelLibraryEntry) => {
    setBusyKey(`${model.id}@${model.version}`);
    setError(null);
    try {
      if (model.assignedSlot) modelLibraryService.clearAssignment(model.assignedSlot);
      else await modelLibraryService.selectModel(model.id, model.version);
      await refresh();
    } catch {
      setError(`Could not assign ${model.displayName}. Install and verify it first.`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Local models</Text>
      <Text style={styles.description}>
        Models run on this device. Install only the ones you want; installing does not enable them.
        Each model can be assigned to its task. Deterministic parsing remains available at all times.
      </Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.button, styles.secondary]}
        onPress={() => {
          modelLibraryService.setDeterministicOnly();
          refresh();
        }}
      >
        <Text style={[styles.buttonText, styles.secondaryText]}>Use deterministic parsing only</Text>
      </TouchableOpacity>
      {loading ? <ActivityIndicator accessibilityLabel="Loading models" /> : null}
      {!loading && models.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No models are published yet</Text>
          <Text style={styles.meta}>Fine-tuned model packages will appear here when they are published and verified.</Text>
        </View>
      ) : null}
      {models.map(model => {
        const key = `${model.id}@${model.version}`;
        const isBusy = busyKey === key;
        const supported = model.supportedPlatforms.includes(Platform.OS === 'ios' ? 'ios' : 'android');
        return (
          <View key={key} style={styles.card}>
            <Text style={styles.name}>{model.displayName}</Text>
            <Text style={styles.meta}>{model.description}</Text>
            <Text style={styles.meta}>Task: {model.task.replace(/_/g, ' ')}</Text>
            <Text style={styles.meta}>Publisher: {model.publisher} · {model.license} · {(model.sizeBytes / 1_000_000).toFixed(1)} MB</Text>
            <Text style={styles.status}>
              {model.active ? `Assigned to ${model.assignedSlot}` : model.installed ? 'Installed' : supported ? 'Available to install' : 'Not supported on this device'}
            </Text>
            {isBusy && !model.installed ? (
              <View style={styles.progress}>
                <Text style={styles.meta}>Downloading: {Math.round(progress * 100)}%</Text>
                <ActivityIndicator />
              </View>
            ) : null}
            <View style={styles.actions}>
              {!model.installed && supported ? (
                <TouchableOpacity accessibilityRole="button" disabled={isBusy} style={styles.button} onPress={() => install(model)}>
                  <Text style={styles.buttonText}>{isBusy ? 'Installing…' : 'Install'}</Text>
                </TouchableOpacity>
              ) : null}
              {model.installed ? (
                <TouchableOpacity accessibilityRole="button" disabled={isBusy} style={[styles.button, styles.secondary]} onPress={() => assignOrClear(model)}>
                  <Text style={[styles.buttonText, styles.secondaryText]}>{model.assignedSlot ? 'Clear assignment' : `Assign to ${model.task.replace(/_/g, ' ')}`}</Text>
                </TouchableOpacity>
              ) : null}
              {model.installed ? (
                <TouchableOpacity accessibilityRole="button" disabled={isBusy} style={[styles.button, styles.danger]} onPress={() => remove(model)}>
                  <Text style={[styles.buttonText, styles.removeText]}>Remove</Text>
                </TouchableOpacity>
              ) : null}
              {isBusy && cancelDownload ? (
                <TouchableOpacity accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={() => cancelDownload()}>
                  <Text style={[styles.buttonText, styles.secondaryText]}>Cancel</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
