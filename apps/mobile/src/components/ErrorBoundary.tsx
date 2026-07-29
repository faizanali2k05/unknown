import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { darkTokens, spacing, typography } from '../theme/tokens';

interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors and shows them instead of letting the app
 * die. A production app would report these somewhere, but on a hand-installed
 * APK a visible message is the difference between "it crashed" and knowing
 * what actually broke.
 *
 * Deliberately uses raw tokens rather than useTheme(): if the theme context is
 * what failed, this screen still has to render.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: darkTokens.bg.primary, padding: spacing.xl }}>
        <ScrollView contentContainerStyle={{ paddingTop: spacing.xxxl }}>
          <Text style={[typography.title, { color: darkTokens.status.danger }]}>
            Something broke
          </Text>
          <Text
            style={[
              typography.body,
              { color: darkTokens.text.primary, marginTop: spacing.lg },
            ]}
          >
            {error.message}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: darkTokens.text.muted, marginTop: spacing.lg, lineHeight: 18 },
            ]}
            selectable
          >
            {error.stack?.slice(0, 2000)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
