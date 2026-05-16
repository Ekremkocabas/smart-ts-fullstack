import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>Er is iets misgegaan</Text>
            <Text style={styles.message}>
              Er is een onverwachte fout opgetreden. Probeer de pagina te vernieuwen.
            </Text>
            {__DEV__ && this.state.error && (
              <View style={styles.devBox}>
                <Text style={styles.devTitle}>Debug info:</Text>
                <Text style={styles.devText}>{this.state.error.toString()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.button}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={styles.buttonText}>Opnieuw proberen</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B4332',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  devBox: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    width: '100%',
  },
  devTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 4,
  },
  devText: {
    fontSize: 11,
    color: '#856404',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#3498db',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
