import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 100,
  },

  totalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainBalanceCol: {
    flex: 1.3,
    justifyContent: 'center',
  },
  totalLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  verticalDividerHeader: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: 8,
  },
  statsColHeader: {
    flex: 1,
    justifyContent: 'center',
  },
  statItemHeader: {
    alignItems: 'flex-start',
  },
  statItemHeaderSpacer: {
    height: 6,
  },
  statLabelHeader: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  incomeAmountHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a5d6a7',
    marginTop: 1,
  },
  expenseAmountHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef9a9a',
    marginTop: 1,
  },

  quickActionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5f6368',
  },
  carouselContainer: {
    marginTop: 20,
    paddingLeft: 16,
  },
  carouselScroll: {
    paddingRight: 16,
    gap: 12,
  },

  insightsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  insightsList: {
    gap: 12,
  },
  insightItem: {
    width: '100%',
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  insightCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c4043',
  },
  insightAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#202124',
  },
  progressBg: {
    height: 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  recentActivityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a73e8',
  },
  recentList: {
    marginHorizontal: 16,
    gap: 8,
  },
  expenseItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  expenseLeft: {
    flex: 1,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  merchant: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
  },
  category: {
    fontSize: 11,
    color: '#5f6368',
    marginTop: 2,
  },
  date: {
    fontSize: 10,
    color: '#9cc0e0',
    marginTop: 4,
    display: 'none',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  debit: {
    color: '#d93025',
  },
  credit: {
    color: '#188038',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  bankBadge: {
    fontSize: 9,
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
  },
  paymentMode: {
    fontSize: 9,
    backgroundColor: '#f1f3f4',
    color: '#5f6368',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  splitBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f4ea',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  splitBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#137333',
  },
  viewHistoryBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
  },
  viewHistoryBtnText: {
    color: '#1a73e8',
    fontSize: 13,
    fontWeight: '700',
  },

  aiInsightsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  insightsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5f6368',
    letterSpacing: 0.5,
  },
  insightsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  insightsBadgeGood: {
    backgroundColor: '#e6f4ea',
  },
  insightsBadgeWarning: {
    backgroundColor: '#fef7e0',
  },
  insightsBadgeDanger: {
    backgroundColor: '#fce8e6',
  },
  insightsBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeTextGood: {
    color: '#137333',
  },
  badgeTextWarning: {
    color: '#b06000',
  },
  badgeTextDanger: {
    color: '#c5221f',
  },
  insightsHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 6,
  },
  insightsMessage: {
    fontSize: 13,
    color: '#5f6368',
    lineHeight: 18,
  },
  insightsStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  insightsStatItem: {
    flex: 1,
  },
  insightsStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#80868b',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  insightsStatVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
  },
  insightsStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#dadce0',
    marginHorizontal: 16,
  },
  textDanger: {
    color: '#c5221f',
  },
  textSuccess: {
    color: '#137333',
  },
});

export default styles;
