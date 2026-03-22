import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Pressable,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useHistoryScreenContext } from '../../context/HistoryScreenContext';
import { RideCard } from '../../components/RideCard';
import { ImportedRideCard } from '../../components/ImportedRideCard';
import type { Ride } from '../../types';

function MyRidesPage({
  width,
  navigateToRideDetail,
}: {
  width: number;
  navigateToRideDetail: (ride: Ride) => void;
}) {
  const { recordedRides, loading, refresh } = useHistoryScreenContext();

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Пока нет поездок</Text>
      <Text style={styles.emptyText}>
        Нажмите «Старт» на вкладке карты, чтобы записать первую поездку.
      </Text>
    </View>
  );

  return (
    <View style={[styles.tabPage, { width }]}>
      <FlatList
        data={recordedRides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RideCard ride={item} onPress={() => navigateToRideDetail(item)} />
        )}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          recordedRides.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        nestedScrollEnabled
      />
    </View>
  );
}

function ImportedRidesPage({
  width,
  navigateToRideDetail,
}: {
  width: number;
  navigateToRideDetail: (ride: Ride) => void;
}) {
  const { importedRides, loading, refresh } = useHistoryScreenContext();

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Импортированных маршрутов пока нет</Text>
      <Text style={styles.emptyText}>
        Нажмите кнопку вложения в шапке экрана и выберите файл GPX — маршруты появятся здесь с
        указанием источника.
      </Text>
    </View>
  );

  return (
    <View style={[styles.tabPage, { width }]}>
      <FlatList
        data={importedRides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ImportedRideCard
            ride={item}
            onPress={() => navigateToRideDetail(item)}
          />
        )}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          importedRides.length === 0 ? styles.emptyList : styles.list
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        nestedScrollEnabled
      />
    </View>
  );
}

export function HistoryTopTabs() {
  const { width } = useWindowDimensions();
  const { setActiveTab, navigateToRideDetail, registerSwitchToImportedTab } =
    useHistoryScreenContext();
  const scrollRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;

  const goToPage = useCallback(
    (index: number) => {
      setPageIndex(index);
      setActiveTab(index === 0 ? 'my' : 'imported');
      scrollRef.current?.scrollTo({ x: index * width, animated: true });
    },
    [width, setActiveTab]
  );

  useEffect(() => {
    registerSwitchToImportedTab(() => goToPage(1));
    return () => registerSwitchToImportedTab(null);
  }, [goToPage, registerSwitchToImportedTab]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      x: pageIndexRef.current * width,
      animated: false,
    });
  }, [width]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(width, 1));
      const clamped = next < 0 ? 0 : next > 1 ? 1 : next;
      if (clamped !== pageIndex) {
        setPageIndex(clamped);
        setActiveTab(clamped === 0 ? 'my' : 'imported');
      }
    },
    [width, pageIndex, setActiveTab]
  );

  return (
    <View style={styles.root}>
      <View style={styles.tabBar}>
        <Pressable
          style={styles.tabCell}
          onPress={() => goToPage(0)}
          accessibilityRole="tab"
          accessibilityState={{ selected: pageIndex === 0 }}
        >
          <Text
            style={[styles.tabLabel, pageIndex === 0 && styles.tabLabelActive]}
          >
            Мои поездки
          </Text>
          {pageIndex === 0 ? <View style={styles.indicator} /> : <View style={styles.indicatorPlaceholder} />}
        </Pressable>
        <Pressable
          style={styles.tabCell}
          onPress={() => goToPage(1)}
          accessibilityRole="tab"
          accessibilityState={{ selected: pageIndex === 1 }}
        >
          <Text
            style={[styles.tabLabel, pageIndex === 1 && styles.tabLabelActive]}
          >
            Импортированные
          </Text>
          {pageIndex === 1 ? <View style={styles.indicator} /> : <View style={styles.indicatorPlaceholder} />}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={styles.pager}
      >
        <MyRidesPage width={width} navigateToRideDetail={navigateToRideDetail} />
        <ImportedRidesPage width={width} navigateToRideDetail={navigateToRideDetail} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  tabCell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 0,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    paddingBottom: 10,
  },
  tabLabelActive: {
    color: '#4CAF50',
  },
  indicator: {
    alignSelf: 'stretch',
    height: 3,
    backgroundColor: '#4CAF50',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  indicatorPlaceholder: {
    height: 3,
    alignSelf: 'stretch',
  },
  pager: {
    flex: 1,
  },
  tabPage: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    paddingVertical: 8,
  },
  emptyList: {
    flexGrow: 1,
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
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
