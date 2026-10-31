// Keep the active editor connected during state updates. Detaching a textarea
// clears the browser's native undo manager, even if the same node is reinserted.
export function renderFrame(root, html, key, text) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const editor = root.querySelector("#composer-input");
  const next = template.content.querySelector("#composer-input");
  const path = (element, boundary) => {
    const result = [];
    for (let node = element; node && node !== boundary; node = node.parentNode) result.unshift(node);
    return result;
  };
  const oldPath = path(editor, root), newPath = path(next, template.content);
  if (!editor || !next || editor.dataset.draftKey !== key || editor.value !== text ||
      oldPath.length !== newPath.length || oldPath.some((node, index) => node.nodeName !== newPath[index].nodeName)) {
    root.replaceChildren(template.content);
    return;
  }
  let parent = root;
  for (let index = 0; index < oldPath.length; index++) {
    const retained = oldPath[index], replacement = newPath[index];
    for (const sibling of [...parent.childNodes]) if (sibling !== retained) sibling.remove();
    const preceding = document.createDocumentFragment(), following = document.createDocumentFragment();
    let after = false;
    for (const sibling of [...replacement.parentNode.childNodes]) {
      if (sibling === replacement) after = true;
      else (after ? following : preceding).append(sibling);
    }
    parent.insertBefore(preceding, retained);
    parent.append(following);
    for (const attribute of [...retained.attributes]) if (!replacement.hasAttribute(attribute.name)) retained.removeAttribute(attribute.name);
    for (const attribute of replacement.attributes) if (retained.getAttribute(attribute.name) !== attribute.value) retained.setAttribute(attribute.name, attribute.value);
    parent = retained;
  }
}
