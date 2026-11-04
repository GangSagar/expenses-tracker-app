package com.expensetracker.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double? = null,
    val timestamp: Long? = null
)

object LocationHelper {

    private const val TAG = "ExpenseTrackerLocation"

    fun getCurrentLocation(context: Context): LocationData? {
        return try {
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: return null

            // 1. Check if location provider is enabled on device
            val isGpsEnabled = try {
                locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            } catch (e: Exception) {
                false
            }

            val isNetworkEnabled = try {
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            } catch (e: Exception) {
                false
            }

            if (!isGpsEnabled && !isNetworkEnabled) {
                Log.d(TAG, "Location services are turned off on device.")
                return null
            }

            // 2. Check runtime permissions
            val hasFine = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            val hasCoarse = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasFine && !hasCoarse) {
                Log.d(TAG, "Location permission not granted.")
                return null
            }

            // 3. Query last known location from best available provider
            var bestLocation: Location? = null

            if (isGpsEnabled && hasFine) {
                try {
                    val gpsLoc = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    if (gpsLoc != null) bestLocation = gpsLoc
                } catch (e: SecurityException) {
                    Log.w(TAG, "SecurityException reading GPS location", e)
                }
            }

            if (isNetworkEnabled && (bestLocation == null || isBetterLocation(locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER), bestLocation))) {
                try {
                    val netLoc = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                    if (netLoc != null) bestLocation = netLoc
                } catch (e: SecurityException) {
                    Log.w(TAG, "SecurityException reading Network location", e)
                }
            }

            bestLocation?.let {
                LocationData(
                    latitude = it.latitude,
                    longitude = it.longitude,
                    accuracy = if (it.hasAccuracy()) it.accuracy.toDouble() else null,
                    timestamp = it.time
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get location safely", e)
            null
        }
    }

    private fun isBetterLocation(location: Location?, currentBestLocation: Location?): Boolean {
        if (location == null) return false
        if (currentBestLocation == null) return true

        val timeDelta = location.time - currentBestLocation.time
        val isSignificantlyNewer = timeDelta > 120000
        val isSignificantlyOlder = timeDelta < -120000
        val isNewer = timeDelta > 0

        if (isSignificantlyNewer) return true
        if (isSignificantlyOlder) return false

        val accuracyDelta = (location.accuracy - currentBestLocation.accuracy).toInt()
        val isLessAccurate = accuracyDelta > 0
        val isMoreAccurate = accuracyDelta < 0

        if (isMoreAccurate) return true
        if (isNewer && !isLessAccurate) return true
        return false
    }
}

