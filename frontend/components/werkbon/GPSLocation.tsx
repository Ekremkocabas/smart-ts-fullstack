/**
 * GPSLocation - Unified GPS Component
 * Used across all werkbon types
 * 
 * Features:
 * - Get current GPS coordinates
 * - Convert coordinates to street address (reverse geocoding)
 * - Show loading state
 * - Display address or coordinates
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

interface GPSLocationProps {
  onLocationChange: (coords: string, address: string) => void;
  primaryColor?: string;
  initialCoords?: string;
  initialAddress?: string;
}

export const GPSLocation: React.FC<GPSLocationProps> = ({
  onLocationChange,
  primaryColor = '#F5A623',
  initialCoords = '',
  initialAddress = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState(initialCoords);
  const [address, setAddress] = useState(initialAddress);

  const getLocation = useCallback(async () => {
    setLoading(true);
    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Toestemming geweigerd', 'Locatietoegang is vereist om GPS te gebruiken.');
        setLoading(false);
        return;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      const coordsString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      setCoords(coordsString);

      // Reverse geocode to get address
      try {
        const [result] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (result) {
          const addressParts = [];
          if (result.street) addressParts.push(result.street);
          if (result.streetNumber) addressParts[0] = `${result.street} ${result.streetNumber}`;
          if (result.city) addressParts.push(result.city);
          if (result.postalCode) addressParts.push(result.postalCode);
          
          const addressString = addressParts.join(', ') || coordsString;
          setAddress(addressString);
          onLocationChange(coordsString, addressString);
        } else {
          setAddress('');
          onLocationChange(coordsString, '');
        }
      } catch (geoError) {
        console.warn('Reverse geocoding failed:', geoError);
        setAddress('');
        onLocationChange(coordsString, '');
      }
    } catch (error: any) {
      console.error('GPS error:', error);
      Alert.alert('GPS Fout', 'Kon locatie niet ophalen. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }, [onLocationChange]);

  const hasLocation = coords !== '';
  const displayText = address || (coords ? `GPS: ${coords}` : 'Locatie openen (GPS vastleggen)');

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Locatie</Text>
      <TouchableOpacity
        style={[
          styles.button,
          { borderColor: hasLocation ? '#28a745' : primaryColor }
        ]}
        onPress={getLocation}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={primaryColor} />
        ) : (
          <Ionicons
            name="navigate"
            size={20}
            color={hasLocation ? '#28a745' : primaryColor}
          />
        )}
        <Text
          style={[
            styles.buttonText,
            { color: hasLocation ? '#28a745' : primaryColor }
          ]}
          numberOfLines={2}
        >
          {displayText}
        </Text>
      </TouchableOpacity>
      
      {/* Show coordinates below address for reference */}
      {address && coords && (
        <Text style={styles.coordsHint}>
          <Ionicons name="location-outline" size={12} color="#8C9199" />
          {' '}{coords}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  buttonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  coordsHint: {
    fontSize: 11,
    color: '#8C9199',
    marginTop: 6,
    marginLeft: 4,
  },
});

export default GPSLocation;
