/**
 * PhotoUpload - Unified Photo Upload Component
 * Used across all werkbon types
 * 
 * Features:
 * - Camera and gallery options
 * - Photo compression (max 5MB)
 * - Multiple photos support
 * - Preview and delete
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

interface PhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  primaryColor?: string;
  label?: string;
}

// Compress image to max 5MB
const compressImage = async (uri: string): Promise<string> => {
  try {
    // Start with quality 0.8
    let quality = 0.8;
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    // Check size and reduce quality if needed
    while (result.base64 && result.base64.length > 5 * 1024 * 1024 * 0.75 && quality > 0.3) {
      quality -= 0.1;
      result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1000 } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
    }

    return result.base64 ? `data:image/jpeg;base64,${result.base64}` : uri;
  } catch (error) {
    console.error('Image compression error:', error);
    return uri;
  }
};

export const PhotoUpload: React.FC<PhotoUploadProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  primaryColor = '#F5A623',
  label = "Foto's",
}) => {
  const [loading, setLoading] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    if (photos.length >= maxPhotos) {
      Alert.alert('Maximum bereikt', `U kunt maximaal ${maxPhotos} foto's toevoegen.`);
      return;
    }

    setLoading(true);
    try {
      // Request permission
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Toestemming vereist', 'Camera toegang is nodig om foto te maken.');
          setLoading(false);
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Toestemming vereist', 'Galerij toegang is nodig om foto te kiezen.');
          setLoading(false);
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsEditing: false,
            allowsMultipleSelection: true,
            selectionLimit: maxPhotos - photos.length,
          });

      if (!result.canceled && result.assets) {
        const newPhotos = [...photos];
        for (const asset of result.assets) {
          if (newPhotos.length >= maxPhotos) break;
          const compressed = await compressImage(asset.uri);
          newPhotos.push(compressed);
        }
        onPhotosChange(newPhotos);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Fout', 'Kon foto niet laden. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  };

  const showOptions = () => {
    Alert.alert(
      'Foto toevoegen',
      'Kies een optie',
      [
        { text: 'Camera', onPress: () => pickImage(true) },
        { text: 'Galerij', onPress: () => pickImage(false) },
        { text: 'Annuleren', style: 'cancel' },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.counter}>{photos.length}/{maxPhotos}</Text>
      </View>

      {/* Photo previews */}
      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photosScroll}
          contentContainerStyle={styles.photosContainer}
        >
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoWrapper}>
              <Image source={{ uri: photo }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removePhoto(index)}
              >
                <Ionicons name="close-circle" size={24} color="#dc3545" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add button */}
      {photos.length < maxPhotos && (
        <TouchableOpacity
          style={[styles.addButton, { borderColor: primaryColor }]}
          onPress={showOptions}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={24} color={primaryColor} />
              <Text style={[styles.addButtonText, { color: primaryColor }]}>
                Foto toevoegen
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  counter: {
    fontSize: 13,
    color: '#8C9199',
  },
  photosScroll: {
    marginBottom: 12,
  },
  photosContainer: {
    gap: 12,
  },
  photoWrapper: {
    position: 'relative',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#E8E9ED',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
});

export default PhotoUpload;
