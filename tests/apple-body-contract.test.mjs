import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../platform/apple-host/MondayIDHost/MondayIDHostApp.swift',import.meta.url),'utf8');
const project=fs.readFileSync(new URL('../platform/apple-host/MondayIDHost.xcodeproj/project.pbxproj',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../platform/apple-adapter/Package.swift',import.meta.url),'utf8');
const intents=fs.readFileSync(new URL('../platform/apple-adapter/Sources/MondayIDAppleAdapter/MondayIDIntents.swift',import.meta.url),'utf8');
const appleWorkflow=fs.readFileSync(new URL('../.github/workflows/apple-build-proof.yml',import.meta.url),'utf8');

test('canonical repository contains the five-surface Monday consumer iPhone body',()=>{
  for(const label of ['Home','Chats','Create','Spaces','You']){
    assert.match(source,new RegExp(`Label\\("${label}"`));
  }
  assert.match(source,/showingSearch/);
  assert.match(source,/showingActivity/);
  assert.match(source,/MondayLibraryView/);
});

test('consumer body preserves local continuity and explicit runtime connection instead of dashboard theater',()=>{
  assert.match(source,/MondayLocalStore/);
  assert.match(source,/UserDefaults\.standard/);
  assert.match(source,/MondayRuntimeConnectionView/);
  assert.match(source,/verifyAndSaveConnection/);
  assert.match(source,/health\.isReady/);
  assert.match(source,/receiptID/);
});

test('Xcode host binds to the local Apple adapter package and declares a real iOS app target',()=>{
  assert.match(project,/XCLocalSwiftPackageReference "\.\.\/apple-adapter"/);
  assert.match(project,/productType = "com\.apple\.product-type\.application"/);
  assert.match(project,/PRODUCT_BUNDLE_IDENTIFIER = com\.mondayid\.host/);
  assert.match(project,/IPHONEOS_DEPLOYMENT_TARGET = 18\.0/);
  assert.match(adapter,/library\(name: "MondayIDAppleAdapter"/);
  assert.match(adapter,/testTarget\(name: "MondayIDAppleAdapterTests"/);
});


test('consumer shortcuts do not expose legacy mode selection as a cognitive primitive',()=>{
  assert.doesNotMatch(source,/AppShortcut\(intent: ActivateModeIntent\(\)/);
  assert.doesNotMatch(intents,/AppShortcut\([\s\S]*?ActivateModeIntent\(\)/);
  assert.match(intents,/Compatibility intent only/);
  assert.match(intents,/choose the required internal functions automatically/);
});

test('capsule and field digest shortcuts execute through the canonical runtime instead of acknowledgement theater',()=>{
  const recall=intents.slice(intents.indexOf('public struct RecallCapsuleIntent'),intents.indexOf('public struct ActivateModeIntent'));
  const digest=intents.slice(intents.indexOf('public struct RunFieldDigestIntent'),intents.indexOf('public struct MondayIDShortcuts'));
  assert.match(recall,/sendToMondayID/);
  assert.match(digest,/sendToMondayID/);
  assert.doesNotMatch(recall,/Capsule request handed to MondayID/);
  assert.doesNotMatch(digest,/Field digest requested/);
});


test('physical iPhone acceptance cannot be satisfied by simulator or paid-api theater',()=>{
  assert.match(source,/targetEnvironment\(simulator\)/);
  assert.match(source,/MondayDeviceAcceptanceStore\.markLaunch\(\)/);
  assert.match(source,/launchCount >= 2/);
  assert.match(source,/recordOnDeviceIntelligence/);
  assert.match(source,/canonicalHealth/);
  assert.match(source,/MondayIDRuntimeClient\(endpoint: canonicalEndpoint, controlToken: ""\)/);
  assert.match(source,/runtimeReceiptID/);
  assert.match(source,/continuityReceiptID/);
  assert.match(source,/Device acceptance/);
  assert.match(source,/https:\/\/mondayid-host\.vercel\.app/);
  assert.doesNotMatch(
    source.slice(source.indexOf('private enum MondayDeviceAcceptanceStore'),source.indexOf('private enum MondayPresenceState')),
    /client\.submit\(/
  );
});

test('Apple proof also compiles the real iPhoneOS target and emits an unsigned signing input',()=>{
  assert.match(appleWorkflow,/generic\/platform=iOS'/);
  assert.match(appleWorkflow,/CODE_SIGNING_ALLOWED=NO/);
  assert.match(appleWorkflow,/Release-iphoneos\/MondayIDHost\.app/);
  assert.match(appleWorkflow,/Monday\.ipa/);
  assert.match(appleWorkflow,/Payload/);
  assert.match(appleWorkflow,/actions\/upload-artifact@v4/);
  assert.match(appleWorkflow,/Physical iPhone signing\/install\/runtime acceptance: NOT PROVEN/);
});


test('Monday chat has a no-spend on-device intelligence route on iOS 27',()=>{
  assert.match(source,/import FoundationModels/);
  assert.match(source,/import Translation/);
  assert.match(source,/SystemLanguageModel\.default/);
  assert.match(source,/LanguageModelSession\(instructions:/);
  assert.match(source,/TranslationSession\(/);
  assert.match(source,/MondayTranslationBridge\.translateInstalled/);
  assert.match(source,/session\.translate\(text\)\.targetText/);
  assert.match(source,/Apple Foundation Model · no API spend/);
  assert.match(source,/onDeviceResponse\(to:/);
});
