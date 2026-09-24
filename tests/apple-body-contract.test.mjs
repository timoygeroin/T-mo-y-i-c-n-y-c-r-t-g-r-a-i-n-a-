import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../platform/apple-host/MondayIDHost/MondayIDHostApp.swift',import.meta.url),'utf8');
const project=fs.readFileSync(new URL('../platform/apple-host/MondayIDHost.xcodeproj/project.pbxproj',import.meta.url),'utf8');
const adapter=fs.readFileSync(new URL('../platform/apple-adapter/Package.swift',import.meta.url),'utf8');
const intents=fs.readFileSync(new URL('../platform/apple-adapter/Sources/MondayIDAppleAdapter/MondayIDIntents.swift',import.meta.url),'utf8');

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
