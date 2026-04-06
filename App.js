import React, { useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, LibreBaskerville_400Regular, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { ActivityIndicator, View, Text } from 'react-native';

import ProjectsScreen from './src/screens/ProjectsScreen';
import PatternScreen from './src/screens/PatternScreen';
import { COLORS } from './src/theme';

const Tab = createBottomTabNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
  });
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectName, setActiveProjectName] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const selectProject = useCallback((id, name) => {
    setActiveProjectId(id);
    setActiveProjectName(name || '');
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.cream }}>
        <ActivityIndicator size="large" color={COLORS.rust} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;
              if (route.name === 'Projects') {
                iconName = focused ? 'folder-open' : 'folder-open-outline';
              } else if (route.name === 'Pattern') {
                iconName = focused ? 'book' : 'book-outline';
              }
              return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: COLORS.rust,
            tabBarInactiveTintColor: COLORS.sage,
            tabBarStyle: {
              height: 62,
              paddingBottom: 8,
              paddingTop: 4,
              backgroundColor: COLORS.white,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontFamily: 'LibreBaskerville_400Regular',
              letterSpacing: 0.3,
            },
            headerStyle: {
              backgroundColor: COLORS.brown,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 0,
            },
            headerTitleStyle: {
              fontFamily: 'LibreBaskerville_700Bold',
              color: COLORS.white,
              fontSize: 17,
              letterSpacing: 0.5,
            },
            headerLeft: () => (
              <Text style={{
                fontFamily: 'LibreBaskerville_400Regular',
                color: COLORS.dustyRose,
                fontSize: 13,
                letterSpacing: 0.8,
                marginLeft: 14,
              }}>
                Peter's Knitting
              </Text>
            ),
          })}
        >
          <Tab.Screen
            name="Projects"
            options={{ title: 'My Projects' }}
          >
            {(props) => (
              <ProjectsScreen
                {...props}
                activeProjectId={activeProjectId}
                onSelectProject={selectProject}
                refreshKey={refreshKey}
              />
            )}
          </Tab.Screen>
          <Tab.Screen
            name="Pattern"
            options={{
              title: activeProjectName ? activeProjectName : 'Pattern',
            }}
          >
            {(props) => (
              <PatternScreen
                {...props}
                activeProjectId={activeProjectId}
                onRefresh={triggerRefresh}
              />
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
