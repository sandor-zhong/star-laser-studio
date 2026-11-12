import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRoomInput } from './room-input.js';

test('the provided root/live link uses its room path instead of numeric query parameters', () => {
  assert.equal(extractRoomInput('https://www.douyin.com/root/live/278339149230?anchor_id=487779206171640&is_aweme_tied=1&r_id=f_278339149230&r_player=1&use_new_preview=true'), '278339149230');
  assert.equal(extractRoomInput('douyin.com/root/live/278339149230/'), '278339149230');
});
test('stand-alone live links and raw room IDs remain supported', () => {
  assert.equal(extractRoomInput(' live.douyin.com/278339149230?from=test '), '278339149230');
  assert.equal(extractRoomInput('278339149230'), '278339149230');
  assert.equal(extractRoomInput(''), '');
});
test('unrelated hosts, user pages and malformed links are not converted into room IDs', () => {
  for (const value of ['https://example.com/root/live/278339149230', 'https://www.douyin.com/user/123?room=456', 'https://live.douyin.com.attacker.example/123', 'not a room']) {
    assert.equal(extractRoomInput(value), value);
  }
});
