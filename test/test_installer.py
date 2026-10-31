"""The optional installer must not replace unrelated user/plugin configuration."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('inbox_install', Path(__file__).parents[1] / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ManagedPatchTests(unittest.TestCase):
    def test_install_and_update_keep_other_plugin_rows(self):
        original = '- id: custom-model\n  config:\n    label: hello\n'
        section = f'{installer.MARKER}\n- id: ui-workspace\n  disabled: true\n{installer.END}\n'
        installed = installer.replace_managed_section(original, section)
        updated = installer.replace_managed_section(installed + '- id: later-plugin\n', section)
        self.assertIn(original.strip(), updated)
        self.assertIn('- id: later-plugin\n', updated)
        self.assertEqual(updated.count(installer.MARKER), 1)
        self.assertEqual(installer.replace_managed_section(updated, section), updated)

    def test_uninstall_retains_user_changes_made_after_install(self):
        section = f'{installer.MARKER}\n- id: ui-workspace\n  disabled: true\n{installer.END}\n'
        text = '- id: before\n\n' + section + '- id: after\n'
        self.assertEqual(installer.replace_managed_section(text, ''), '- id: before\n- id: after\n')

    def test_ambiguous_markers_are_not_rewritten(self):
        with self.assertRaises(ValueError):
            installer.replace_managed_section(installer.MARKER, '')
        with self.assertRaises(ValueError):
            installer.replace_managed_section((installer.MARKER + installer.END) * 2, '')


if __name__ == '__main__':
    unittest.main()
