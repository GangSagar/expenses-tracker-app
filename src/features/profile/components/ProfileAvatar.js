import React from 'react';
import { View, Text } from 'react-native';
import commonStyles from '../../../styles/commonStyles';

/**
 * ProfileAvatar component renders the header section of the settings screen.
 */
export default function ProfileAvatar() {
  return (
    <View style={commonStyles.header}>
      <Text style={commonStyles.headerTitle}>Settings</Text>
    </View>
  );
}
