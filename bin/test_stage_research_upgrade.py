import copy
import hashlib
import unittest

from stage_research_upgrade import migrate


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.source = [
            {"title": "Old template", "text": "Template body", "tags": "$:/tags/ViewTemplate [[Research notes]]",
             "stream-list": "[[Child note]]"},
            {"title": "Child note", "text": "Keep this note", "parent": "Old template"},
        ]
        self.entry = {"title": "Old template", "action": "retire",
                      "text_sha256": hashlib.sha256(b"Template body").hexdigest()}

    def test_retirement_preserves_documentation_and_child_relationships(self):
        template, child = migrate(self.source, [self.entry])
        self.assertEqual(template["tags"], "[[Research notes]]")
        self.assertEqual(template["text"], "Template body")
        self.assertEqual(template["stream-list"], "[[Child note]]")
        self.assertEqual(child, self.source[1])

    def test_source_remains_unchanged_for_the_archive(self):
        before = copy.deepcopy(self.source)
        migrate(self.source, [self.entry])
        self.assertEqual(self.source, before)

    def test_changed_customization_requires_review(self):
        self.source[0]["text"] = "New user customization"
        with self.assertRaisesRegex(ValueError, "changed; review"):
            migrate(self.source, [self.entry])

    def test_missing_customization_requires_review(self):
        with self.assertRaisesRegex(ValueError, "missing"):
            migrate([], [self.entry])

    def test_removal_is_limited_to_the_manifest(self):
        child, = migrate(self.source, [{**self.entry, "action": "delete"}])
        self.assertEqual(child["title"], "Child note")


if __name__ == "__main__":
    unittest.main()
