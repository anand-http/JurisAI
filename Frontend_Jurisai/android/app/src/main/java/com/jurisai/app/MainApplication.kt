package com.jurisai.app

import android.app.Application
import cl.json.ShareApplication
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication, ShareApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  // Exported drafts live in the app's files dir, which react-native-share's own
  // provider doesn't cover. react-native-blob-util's provider (same authority
  // below, declared in its manifest) does, so sharing goes through it.
  override fun getFileProviderAuthority(): String = "$packageName.provider"

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
