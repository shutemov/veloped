import React from 'react';
import { View, FlatList, Text, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRides } from '../hooks/useRides';
import { RideCard } from '../components/RideCard';
import { Ride } from '../types';

type HistoryStackParamList = {
  HistoryList: undefined;
  RideDetail: { rideId: string };
};

type NavigationProp = NativeStackNavigationProp<HistoryStackParamList, 'HistoryList'>;

export function HistoryScreen() {
  const { rides, loading, refresh } = useRides();
  const navigation = useNavigation<NavigationProp>();

  const handleRidePress = (ride: Ride) => {
    navigation.navigate('RideDetail', { rideId: ride.id });
  };

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Пока нет поездок</Text>
      <Text style={styles.emptyText}>
        Нажмите «Старт» на вкладке карты, чтобы записать первую поездку.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={rides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RideCard ride={item} onPress={() => handleRidePress(item)} />
        )}
        ListEmptyComponent={renderEmptyList}
        contentContainerStyle={rides.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
