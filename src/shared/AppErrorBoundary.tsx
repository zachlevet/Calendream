import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface State {
  error: Error | null;
  retryKey: number;
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Calendream render failure', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return <View key={this.state.retryKey} style={styles.app}>{this.props.children}</View>;
    const dark = Appearance.getColorScheme() === 'dark';
    const background = dark ? '#000000' : '#FFFFFF';
    const text = dark ? '#FFFFFF' : '#111111';
    const secondary = dark ? '#A1A1A6' : '#6E6E73';
    const card = dark ? '#1C1C1E' : '#F2F2F7';
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>CALENDREAM PAUSED</Text>
          <Text style={[styles.title, { color: text }]}>Something didn’t open correctly.</Text>
          <Text style={[styles.body, { color: secondary }]}>Your local calendar was not erased. Try reopening this screen.</Text>
          <View style={[styles.detail, { backgroundColor: card }]}>
            <Text selectable style={[styles.detailText, { color: secondary }]}>{this.state.error.message}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 28 },
  eyebrow: { color: '#FF3B30', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { marginTop: 8, fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8 },
  body: { marginTop: 12, fontSize: 16, lineHeight: 23 },
  detail: { marginTop: 20, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  detailText: { fontSize: 12, lineHeight: 17 },
  retry: { height: 50, marginTop: 20, borderRadius: 16, backgroundColor: '#0A84FF', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
