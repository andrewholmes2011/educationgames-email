import test from "node:test";
import assert from "node:assert/strict";
function validDistrictCode(v){return /^[a-z0-9][a-z0-9-]{1,19}$/.test(v);}
function validStudentUsername(v){return /^[a-z0-9][a-z0-9._-]{1,30}$/.test(v);}
function validSiteAddress(v){return /^[a-z0-9][a-z0-9._-]{1,30}@students\.[a-z0-9][a-z0-9-]{1,19}\.holmes$/.test(v)||v==="admin@staff.educationgames.holmes";}
test("district codes support the supplied examples",()=>{assert.equal(validDistrictCode("rsd400"),true);assert.equal(validDistrictCode("psd1"),true);assert.equal(validDistrictCode("bad code"),false);assert.equal(validDistrictCode("x"),false);});
test("student mailbox usernames are constrained",()=>{assert.equal(validStudentUsername("andrew.holmes"),true);assert.equal(validStudentUsername("student_01"),true);assert.equal(validStudentUsername("a"),false);assert.equal(validStudentUsername("bad name"),false);});
test("mailbox addresses stay inside the application namespace",()=>{assert.equal(validSiteAddress("andrew@commga.com"),true);assert.equal(validSiteAddress("alex@commga.com"),true);assert.equal(validSiteAddress("admin@commga.com"),true);assert.equal(validSiteAddress("robotics@commga.com"),true);assert.equal(validSiteAddress("person@gmail.com"),false);assert.equal(validSiteAddress("admin@educationgames.local"),false);});