import { StyleSheet } from 'react-native';
import theme from './theme';

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.background,
  },
  header: {
    backgroundColor: theme.COLORS.primary,
    paddingTop: 48,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: theme.FONTS.sizes.title,
    fontWeight: theme.FONTS.weights.bold,
    color: theme.COLORS.white,
  },
  sectionHeading: {
    fontSize: theme.FONTS.sizes.xl,
    fontWeight: theme.FONTS.weights.bold,
    color: theme.COLORS.textPrimary,
    marginBottom: 12,
  },
  empty: {
    backgroundColor: theme.COLORS.white,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.COLORS.borderLight,
    ...theme.SHADOWS.small,
  },
  emptyText: {
    fontSize: theme.FONTS.sizes.lg,
    fontWeight: theme.FONTS.weights.bold,
    color: theme.COLORS.textSecondary,
  },
  emptySubtext: {
    fontSize: theme.FONTS.sizes.sub,
    color: theme.COLORS.textTertiary,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: theme.COLORS.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.SHADOWS.floating,
  },
  fabIcon: {
    fontSize: theme.FONTS.sizes.hero,
    color: theme.COLORS.white,
    fontWeight: theme.FONTS.weights.bold,
    marginTop: -2,
  },
  flexRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flexRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: theme.COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.COLORS.borderLight,
    ...theme.SHADOWS.small,
  },
  badge: {
    fontSize: theme.FONTS.sizes.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: theme.FONTS.weights.bold,
  },
});

export default commonStyles;
