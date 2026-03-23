import React from 'react';
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
import { HistoryRidesSortChips } from '../../components/HistoryRidesSortChips';
import { sortRidesForList, type RideListSortMode } from '../../utils/sortRidesForList';
import type { Ride } from '../../types';

function MyRidesPage({
  width,
  rides,
  navigateToRideDetail,
}: {
  width: number;
  rides: Ride[];
  navigateToRideDetail: (ride: Ride) => void;
}) {
  const { loading, refresh } = useHistoryScreenContext();

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
        data={rides}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RideCard ride={item} onPress={() => navigateToRideDetail(item)} />
        )}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={rides.length === 0 ? styles.emptyList : styles.list}
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
  rides,
  navigateToRideDetail,
}: {
  width: number;
  rides: Ride[];
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
        data={rides}
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
  const {
    recordedRides,
    importedRides,
    setActiveTab,
    navigateToRideDetail,
    registerSwitchToImportedTab,
  } = useHistoryScreenContext();
  const scrollRef = React.useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [sortModeMy, setSortModeMy] = React.useState<RideListSortMode>('date');
  const [sortModeImported, setSortModeImported] =
    React.useState<RideListSortMode>('date');
  const pageIndexRef = React.useRef(pageIndex);
  pageIndexRef.current = pageIndex;

  const displayedRecorded = React.useMemo(
    () => sortRidesForList(recordedRides, sortModeMy),
    [recordedRides, sortModeMy]
  );
  const displayedImported = React.useMemo(
    () => sortRidesForList(importedRides, sortModeImported),
    [importedRides, sortModeImported]
  );

  /** Какая страница пейджера визуально по центру — для фиксированных чипов над списком. */
  const [scrollPage, setScrollPage] = React.useState(0);

  React.useEffect(() => {
    setScrollPage(pageIndex);
  }, [pageIndex]);

  const goToPage = React.useCallback(
    (index: number) => {
      setPageIndex(index);
      setActiveTab(index === 0 ? 'my' : 'imported');
      scrollRef.current?.scrollTo({ x: index * width, animated: true });
    },
    [width, setActiveTab]
  );

  React.useEffect(() => {
    registerSwitchToImportedTab(() => goToPage(1));
    return () => registerSwitchToImportedTab(null);
  }, [goToPage, registerSwitchToImportedTab]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      x: pageIndexRef.current * width,
      animated: false,
    });
  }, [width]);

  const onMomentumScrollEnd = React.useCallback(
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

  const onPagerScroll = React.useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const w = Math.max(width, 1);
      const p = Math.min(1, Math.max(0, Math.round(x / w)));
      setScrollPage(p);
    },
    [width]
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

      {scrollPage === 0 && recordedRides.length > 0 ? (
        <HistoryRidesSortChips sortMode={sortModeMy} onSortModeChange={setSortModeMy} />
      ) : null}
      {scrollPage === 1 && importedRides.length > 0 ? (
        <HistoryRidesSortChips
          sortMode={sortModeImported}
          onSortModeChange={setSortModeImported}
        />
      ) : null}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={styles.pager}
      >
        <MyRidesPage
          width={width}
          rides={displayedRecorded}
          navigateToRideDetail={navigateToRideDetail}
        />
        <ImportedRidesPage
          width={width}
          rides={displayedImported}
          navigateToRideDetail={navigateToRideDetail}
        />
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
