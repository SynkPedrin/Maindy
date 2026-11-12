Pod::Spec.new do |s|
  s.name           = 'MaindyNative'
  s.version        = '0.1.0'
  s.summary        = 'MAINDY native integrations (widgets snapshot, Live Activities, App Intents bridge)'
  s.description    = 'Local Expo module for MAINDY: writes the WidgetKit snapshot to the App Group, drives the focus Live Activity and hands App Intent deep links to JS.'
  s.author         = 'MAINDY'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { type: 'UNLICENSED' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.swift_version  = '5.9'
  s.frameworks     = 'WidgetKit', 'ActivityKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
