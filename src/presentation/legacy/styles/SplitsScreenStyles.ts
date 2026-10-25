import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  dashboardCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 20,
    alignItems: 'center',
  },
  dashboardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5f6368',
    letterSpacing: 1.5,
  },
  dashboardNet: {
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 4,
  },
  dashboardStatus: {
    fontSize: 13,
    color: '#5f6368',
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#f1f3f4',
    marginVertical: 16,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#80868b',
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  verticalDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#f1f3f4',
  },

  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8eaed',
    overflow: 'hidden',
  },
  contactCardExpanded: {
    borderColor: '#1a73e8',
    shadowColor: '#1a73e8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a73e8',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 2,
  },
  contactNetText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  expandChevron: {
    fontSize: 12,
    color: '#80868b',
    paddingHorizontal: 4,
  },
  detailsBox: {
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    padding: 14,
  },
  detailsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#80868b',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  settledSectionHeader: {
    borderTopWidth: 1,
    borderTopColor: '#e8eaed',
    paddingTop: 12,
    marginTop: 12,
  },
  billItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  settledBillItem: {
    backgroundColor: '#f1f3f4',
    borderColor: '#e8eaed',
  },
  billMerchant: {
    fontSize: 13,
    fontWeight: '600',
    color: '#202124',
  },
  settledBillMerchant: {
    fontSize: 13,
    fontWeight: '500',
    color: '#5f6368',
    textDecorationLine: 'line-through',
  },
  billMeta: {
    fontSize: 11,
    color: '#80868b',
    marginTop: 2,
  },
  billAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  settleBtn: {
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  settleBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  unsettleBtn: {
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#dadce0',
    marginTop: 8,
    marginBottom: 4,
  },
  unsettleBtnText: {
    color: '#5f6368',
    fontSize: 13,
    fontWeight: '700',
  },
  settledBadge: {
    backgroundColor: '#e6f4ea',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  settledBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#137333',
  },
  positiveText: {
    color: '#137333',
  },
  negativeText: {
    color: '#c5221f',
  },
  neutralText: {
    color: '#5f6368',
  },
});

export default styles;
